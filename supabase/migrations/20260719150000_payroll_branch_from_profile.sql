-- Use the Team module's branch assignment (profiles.branch_id) for payroll.
--
-- 1. payroll_generate_run: item branch = majority shift-hours branch, else
--    the staff member's assigned branch (profiles.branch_id), else null
--    (consolidated-only).
-- 2. finance_pnl salary estimate fallback: branch share is computed from
--    shift hours when hours exist; when the person logged no hours but has
--    an assigned branch, their full prorated salary allocates to that branch
--    instead of vanishing from branch P&Ls.
--
-- Only the branch-selection expressions change versus 20260719130000
-- (payroll_generate_run) and 20260719140000 (finance_pnl); everything else
-- is byte-identical.

-- ── 1. payroll_generate_run ──────────────────────────────────────────────────
create or replace function public.payroll_generate_run(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_run_id uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
    raise exception 'owner only';
  end if;

  if exists (select 1 from payroll_runs where period_month = v_month and status = 'completed') then
    raise exception 'payroll run for % is already completed', to_char(v_month, 'YYYY-MM');
  end if;

  -- Keep an existing draft run row; regenerate its items from scratch.
  select id into v_run_id from payroll_runs where period_month = v_month;
  if v_run_id is null then
    insert into payroll_runs (period_month, created_by)
    values (v_month, auth.uid())
    returning id into v_run_id;
  else
    delete from payroll_run_items where run_id = v_run_id;
  end if;

  insert into payroll_run_items (
    run_id, profile_id, branch_id,
    base_lyd, overtime_lyd, bonus_lyd, deduction_lyd, loan_repayment_lyd
  )
  select
    v_run_id,
    pr.id,
    -- Branch with the most shift hours this month; else the Team-module
    -- branch assignment; else null (consolidated only).
    coalesce(
      (select slc.branch_id
         from shift_labor_cost slc
        where slc.user_id = pr.id
          and slc.clocked_in_at >= v_month::timestamptz
          and slc.clocked_in_at < (v_month + interval '1 month')::timestamptz
        group by slc.branch_id
        order by sum(slc.hours) desc
        limit 1),
      pr.branch_id
    ),
    pr.monthly_salary,
    coalesce((select sum(la.amount_lyd) from labor_adjustments la
      where la.profile_id = pr.id and la.kind = 'overtime'
        and la.adjustment_date >= v_month
        and la.adjustment_date < (v_month + interval '1 month')::date), 0),
    coalesce((select sum(la.amount_lyd) from labor_adjustments la
      where la.profile_id = pr.id and la.kind = 'bonus'
        and la.adjustment_date >= v_month
        and la.adjustment_date < (v_month + interval '1 month')::date), 0),
    coalesce((select sum(la.amount_lyd) from labor_adjustments la
      where la.profile_id = pr.id and la.kind = 'deduction'
        and la.adjustment_date >= v_month
        and la.adjustment_date < (v_month + interval '1 month')::date), 0),
    coalesce((select sum(least(b.monthly_repayment_lyd, b.remaining_lyd))
      from staff_loan_balances b
      where b.profile_id = pr.id
        and b.status = 'active'
        and date_trunc('month', b.start_month)::date <= v_month), 0)
  from profiles pr
  where coalesce(pr.monthly_salary, 0) > 0;

  update payroll_runs
     set total_lyd = coalesce((
       select sum(i.net_lyd) from payroll_run_items i where i.run_id = v_run_id
     ), 0)
   where id = v_run_id;

  return v_run_id;
end;
$$;

grant execute on function public.payroll_generate_run(date) to authenticated;

-- ── 2. finance_pnl: estimate fallback honors the assigned branch ─────────────
create or replace function public.finance_pnl(
  p_branch_id      uuid,
  p_from           date,
  p_to             date,
  p_net_of_refunds boolean default false
) returns jsonb
language sql stable security definer
set search_path = public
as $$
  with sales as (
    select
      coalesce(sum(case when status = 'completed' then total else 0 end), 0)
        - case when p_net_of_refunds then coalesce(sum(refunded_amount_lyd), 0) else 0 end as net_revenue,
      coalesce(sum(case when status = 'completed' then discount_amount else 0 end), 0) as discounts,
      coalesce(sum(refunded_amount_lyd), 0) as refunds,
      count(*) filter (where status = 'completed') as orders_count
    from pos_orders
    where (p_branch_id is null or branch_id = p_branch_id)
      and created_at >= p_from::timestamptz
      and created_at < (p_to + interval '1 day')::timestamptz
  ),
  cogs as (
    select coalesce(sum(coalesce(pp.cost_lyd, 0) * oi.quantity), 0) as cogs_lyd
    from pos_orders o
    join pos_order_items oi on oi.order_id = o.id
    left join pos_products pp on pp.id = oi.product_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.created_at >= p_from::timestamptz
      and o.created_at < (p_to + interval '1 day')::timestamptz
      and o.status = 'completed'
  ),
  modifier_cogs as (
    select coalesce(sum(coalesce(m.cost_delta_lyd, 0) * oi.quantity), 0) as mod_cogs_lyd
    from pos_order_item_modifiers oim
    join pos_modifiers m on m.id = oim.modifier_id
    join pos_order_items oi on oi.id = oim.order_item_id
    join pos_orders o on o.id = oi.order_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.created_at >= p_from::timestamptz
      and o.created_at < (p_to + interval '1 day')::timestamptz
      and o.status = 'completed'
  ),
  -- Hourly leg: shift pay for staff WITHOUT a monthly salary only. Salaried
  -- staff are costed in labor_salary below (one-pay-path rule).
  labor_hourly as (
    select coalesce(sum(slc.labor_cost_lyd), 0) as hourly_lyd
    from shift_labor_cost slc
    where (p_branch_id is null or slc.branch_id = p_branch_id)
      and slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at < (p_to + interval '1 day')::timestamptz
      and not exists (
        select 1 from profiles pr
        where pr.id = slc.user_id
          and coalesce(pr.monthly_salary, 0) > 0
      )
  ),
  -- Shift hours per staff member in the period, for branch allocation of
  -- salaries. Hours come from shift_labor_cost (the pos_shift_attendees view).
  shift_hours as (
    select
      slc.user_id,
      coalesce(sum(slc.hours) filter (where slc.branch_id = p_branch_id), 0) as branch_hours,
      coalesce(sum(slc.hours), 0) as total_hours
    from shift_labor_cost slc
    where slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at < (p_to + interval '1 day')::timestamptz
    group by slc.user_id
  ),
  -- Salary leg: best available payroll run (completed, then draft), prorated
  -- by overlap days ÷ days-in-month; else the monthly_salary estimate.
  -- Estimate branch share: shift-hours share when hours exist; else the
  -- staff member's assigned branch (profiles.branch_id); else 0 for
  -- branches (full amount stays consolidated-only).
  labor_salary as (
    select coalesce(sum(per_month.amount_lyd), 0) as salary_lyd
    from (
      select
        coalesce((
          select sum(
            i.net_lyd
            * (least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
               - greatest(p_from, m.month_start) + 1)::numeric
            / extract(day from (m.month_start + interval '1 month' - interval '1 day')::date)
          )
          from payroll_runs r
          join payroll_run_items i on i.run_id = r.id
          where r.id = (
            select r2.id
            from payroll_runs r2
            where r2.period_month = m.month_start
            order by case r2.status when 'completed' then 0 else 1 end
            limit 1
          )
            and (p_branch_id is null or i.branch_id = p_branch_id)
        ), (
          select coalesce(sum(
            pr.monthly_salary
            * (least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
               - greatest(p_from, m.month_start) + 1)::numeric
            / extract(day from (m.month_start + interval '1 month' - interval '1 day')::date)
            * case
                when p_branch_id is null then 1
                when coalesce(sh.total_hours, 0) > 0 then sh.branch_hours / sh.total_hours
                when pr.branch_id is not null then case when pr.branch_id = p_branch_id then 1 else 0 end
                else 0
              end
          ), 0)
          from profiles pr
          left join shift_hours sh on sh.user_id = pr.id
          where coalesce(pr.monthly_salary, 0) > 0
        )) as amount_lyd
      from (
        select generate_series(
          date_trunc('month', p_from)::date,
          date_trunc('month', p_to)::date,
          interval '1 month'
        )::date as month_start
      ) m
    ) per_month
  ),
  -- Adjustments leg: skipped for months covered by ANY payroll run.
  labor_adjustments_total as (
    select
      coalesce(sum(la.amount_lyd) filter (where la.kind in ('overtime', 'bonus')), 0)
        - coalesce(sum(la.amount_lyd) filter (where la.kind = 'deduction'), 0) as adjustments_lyd
    from labor_adjustments la
    where la.adjustment_date >= p_from
      and la.adjustment_date <= p_to
      and (p_branch_id is null or la.branch_id = p_branch_id)
      and not exists (
        select 1 from payroll_runs pr
        where pr.period_month = date_trunc('month', la.adjustment_date)::date
      )
  ),
  labor as (
    select
      (select hourly_lyd from labor_hourly)
      + (select salary_lyd from labor_salary)
      + (select adjustments_lyd from labor_adjustments_total) as labor_lyd
  ),
  opex as (
    select
      coalesce(sum(amount_lyd) filter (where is_capex = false), 0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (where is_capex = true), 0) as capex_lyd
    from (
      select
        coalesce(ee.amount_lyd, 0) as amount_lyd,
        (ee.category = 'capex') as is_capex
      from expense_entries ee
      where (p_branch_id is null or ee.branch_id = p_branch_id)
        and ee.paid_at >= p_from
        and ee.paid_at <= p_to
        and (ee.status is null or ee.status = 'approved')

      union all

      select
        coalesce(
          case
            when e.coverage_months > 1 and e.coverage_start is not null then
              e.amount_lyd
              * (greatest(0,
                  least(p_to, (e.coverage_start + (e.coverage_months || ' months')::interval - interval '1 day')::date)
                  - greatest(p_from, e.coverage_start) + 1))::numeric
              / greatest(1,
                  ((e.coverage_start + (e.coverage_months || ' months')::interval - interval '1 day')::date
                   - e.coverage_start + 1))
            else e.amount_lyd
          end,
          0
        ) as amount_lyd,
        false as is_capex
      from expenses e
      left join cost_centers cc on cc.id::text = e.cost_center_id::text
      where e.status in ('approved', 'paid')
        and (
          case
            when e.coverage_months > 1 and e.coverage_start is not null then
              e.coverage_start <= p_to
              and (e.coverage_start + (e.coverage_months || ' months')::interval - interval '1 day')::date >= p_from
            else
              e.expense_date >= p_from
              and e.expense_date <= p_to
          end
        )
        and (p_branch_id is null or cc.pos_branch_id = p_branch_id)
    ) combined
  )
  select jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'branch_id', p_branch_id,
    'net_of_refunds', p_net_of_refunds,
    'orders', (select orders_count from sales),
    'revenue_net', (select net_revenue from sales),
    'discounts', (select discounts from sales),
    'refunds', (select refunds from sales),
    'cogs', (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs),
    'cogs_base', (select cogs_lyd from cogs),
    'cogs_modifiers', (select mod_cogs_lyd from modifier_cogs),
    'labor', (select labor_lyd from labor),
    'labor_hourly', (select hourly_lyd from labor_hourly),
    'labor_salary', (select salary_lyd from labor_salary),
    'labor_adjustments', (select adjustments_lyd from labor_adjustments_total),
    'opex', (select opex_lyd from opex),
    'capex', (select capex_lyd from opex),
    'prime_cost', (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs) + (select labor_lyd from labor),
    'net_contribution',
      (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs))
      - (select labor_lyd from labor)
      - (select opex_lyd from opex)
  );
$$;

grant execute on function public.finance_pnl(uuid, date, date, boolean) to authenticated;
