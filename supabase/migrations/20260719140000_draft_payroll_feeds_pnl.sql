-- Draft payroll runs also feed finance_pnl (proportionally).
--
-- Before: the labor_salary leg used a month's payroll run only when it was
-- COMPLETED; drafts were ignored and the monthly_salary estimate was used.
-- After: per calendar month the priority is — completed run, then draft run,
-- then the monthly_salary estimate. Run item nets are prorated by overlap
-- days ÷ days-in-month, so weekly/custom periods take a proportional slice
-- of the saved run. The adjustments leg now also skips months covered by a
-- DRAFT run (its items already contain those adjustments — no double count).
--
-- Only the labor_salary and labor_adjustments_total CTEs change versus
-- 20260719130000; every other CTE and output field is identical.

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
  -- Salary leg: per calendar month overlapping [p_from, p_to], use the best
  -- available payroll run — completed first, then draft — prorated by
  -- overlap days ÷ days-in-month (branch P&L counts only items booked at
  -- that branch; null-branch items are consolidated-only). With no run at
  -- all, fall back to each salaried profile's monthly_salary prorated
  -- day-by-day with the hours-share branch allocation.
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
                when coalesce(sh.total_hours, 0) = 0 then 0
                else sh.branch_hours / sh.total_hours
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
  -- Adjustments leg: overtime and bonus add, deductions subtract. Months
  -- covered by ANY payroll run (draft or completed) are excluded — those
  -- adjustments are already inside the run's net_lyd.
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
      -- Finance-module entries without a branch are consolidated-only. This
      -- prevents shared entries from being double-counted in branch views.
      select
        coalesce(ee.amount_lyd, 0) as amount_lyd,
        (ee.category = 'capex') as is_capex
      from expense_entries ee
      where (p_branch_id is null or ee.branch_id = p_branch_id)
        and ee.paid_at >= p_from
        and ee.paid_at <= p_to
        and (ee.status is null or ee.status = 'approved')

      union all

      -- Canonical expenses are allocated through their cost center. Expenses
      -- without a branch mapping remain visible in consolidated P&L only.
      -- Prepaid rows (coverage_months > 1) are amortized day-by-day over
      -- [coverage_start, coverage_start + coverage_months - 1 day]; rows with
      -- a single month (or no coverage_start) keep the expense_date behavior.
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
