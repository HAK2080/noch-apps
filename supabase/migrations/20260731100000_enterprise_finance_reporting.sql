-- Enterprise finance reporting controls.
--
-- 1. Use Noch's 05:00 Africa/Tripoli business-day boundary consistently.
-- 2. Restore shared-cost fields lost when later payroll migrations replaced
--    finance_pnl.
-- 3. Preserve latest payroll-run priority and assigned-branch fallback.
-- 4. Expose explicit report-completeness evidence instead of silent zeroes.

begin;

create or replace function public.finance_shared_allocation_share(
  p_source_cost_center_id text,
  p_branch_id uuid,
  p_as_of_date date
) returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_policy shared_cost_allocation_policies;
  v_target_count int;
  v_fixed_weight numeric;
  v_branch_revenue numeric;
  v_total_revenue numeric;
  v_month_start date := date_trunc('month', p_as_of_date)::date;
  v_month_end date := (date_trunc('month', p_as_of_date) + interval '1 month')::date;
begin
  select * into v_policy
  from shared_cost_allocation_policies
  where source_cost_center_id = p_source_cost_center_id
    and effective_from <= p_as_of_date
    and (effective_to is null or effective_to >= p_as_of_date)
  order by effective_from desc
  limit 1;

  if v_policy.id is null then return 0; end if;
  if not exists (
    select 1
    from shared_cost_allocation_targets
    where policy_id = v_policy.id
      and branch_id = p_branch_id
  ) then return 0; end if;

  select count(*) into v_target_count
  from shared_cost_allocation_targets
  where policy_id = v_policy.id;
  if v_target_count = 0 then return 0; end if;

  if v_policy.method = 'fixed' then
    select coalesce(fixed_weight_pct, 0) into v_fixed_weight
    from shared_cost_allocation_targets
    where policy_id = v_policy.id
      and branch_id = p_branch_id;
    return v_fixed_weight / 100;
  end if;

  if v_policy.method = 'equal' then
    return 1::numeric / v_target_count;
  end if;

  select
    coalesce(sum(greatest(coalesce(o.total, 0) - coalesce(o.refunded_amount_lyd, 0), 0))
      filter (where o.branch_id = p_branch_id), 0),
    coalesce(sum(greatest(coalesce(o.total, 0) - coalesce(o.refunded_amount_lyd, 0), 0)), 0)
  into v_branch_revenue, v_total_revenue
  from pos_orders o
  join shared_cost_allocation_targets target
    on target.policy_id = v_policy.id
   and target.branch_id = o.branch_id
  where o.status = 'completed'
    and ((o.created_at at time zone 'Africa/Tripoli') - interval '5 hours')::date >= v_month_start
    and ((o.created_at at time zone 'Africa/Tripoli') - interval '5 hours')::date < v_month_end;

  if v_total_revenue <= 0 then
    return 1::numeric / v_target_count;
  end if;
  return v_branch_revenue / v_total_revenue;
end;
$$;

grant execute on function public.finance_shared_allocation_share(text, uuid, date)
  to authenticated;

create or replace function public.finance_allocation_basis(p_as_of_date date)
returns table(branch_id uuid, branch_name text, revenue_lyd numeric)
language sql stable security definer
set search_path = public
as $$
  select
    branch.id,
    branch.name,
    coalesce(sum(greatest(coalesce(o.total, 0) - coalesce(o.refunded_amount_lyd, 0), 0)), 0)
  from pos_branches branch
  left join pos_orders o
    on o.branch_id = branch.id
   and o.status = 'completed'
   and ((o.created_at at time zone 'Africa/Tripoli') - interval '5 hours')::date
       >= date_trunc('month', p_as_of_date)::date
   and ((o.created_at at time zone 'Africa/Tripoli') - interval '5 hours')::date
       < (date_trunc('month', p_as_of_date) + interval '1 month')::date
  where branch.is_active = true
  group by branch.id, branch.name
  order by branch.name;
$$;

grant execute on function public.finance_allocation_basis(date) to authenticated;

create or replace function public.finance_pnl(
  p_branch_id uuid,
  p_from date,
  p_to date,
  p_net_of_refunds boolean default false
) returns jsonb
language sql stable security definer
set search_path = public
as $$
  with bounds as (
    select
      (p_from::timestamp + interval '5 hours') at time zone 'Africa/Tripoli' as from_utc,
      ((p_to + 1)::timestamp + interval '5 hours') at time zone 'Africa/Tripoli' as to_utc
  ),
  sales as (
    select
      coalesce(sum(case when status = 'completed' then total else 0 end), 0)
        - case when p_net_of_refunds then coalesce(sum(refunded_amount_lyd), 0) else 0 end
        as net_revenue,
      coalesce(sum(case when status = 'completed' then discount_amount else 0 end), 0)
        as discounts,
      coalesce(sum(refunded_amount_lyd), 0) as refunds,
      count(*) filter (where status = 'completed') as orders_count,
      max(created_at) filter (where status = 'completed') as latest_sale_at
    from pos_orders
    cross join bounds
    where (p_branch_id is null or branch_id = p_branch_id)
      and created_at >= bounds.from_utc
      and created_at < bounds.to_utc
  ),
  cogs as (
    select coalesce(sum(coalesce(product.cost_lyd, 0) * item.quantity), 0) as cogs_lyd
    from pos_orders orders
    join pos_order_items item on item.order_id = orders.id
    left join pos_products product on product.id = item.product_id
    cross join bounds
    where (p_branch_id is null or orders.branch_id = p_branch_id)
      and orders.created_at >= bounds.from_utc
      and orders.created_at < bounds.to_utc
      and orders.status = 'completed'
  ),
  modifier_cogs as (
    select coalesce(sum(coalesce(modifier.cost_delta_lyd, 0) * item.quantity), 0)
      as modifier_cogs_lyd
    from pos_order_item_modifiers selected_modifier
    join pos_modifiers modifier on modifier.id = selected_modifier.modifier_id
    join pos_order_items item on item.id = selected_modifier.order_item_id
    join pos_orders orders on orders.id = item.order_id
    cross join bounds
    where (p_branch_id is null or orders.branch_id = p_branch_id)
      and orders.created_at >= bounds.from_utc
      and orders.created_at < bounds.to_utc
      and orders.status = 'completed'
  ),
  report_months as (
    select generate_series(
      date_trunc('month', p_from)::date,
      date_trunc('month', p_to)::date,
      interval '1 month'
    )::date as month_start
  ),
  shared_shares as (
    select
      center.id as cost_center_id,
      month.month_start,
      case
        when p_branch_id is null then 1::numeric
        else finance_shared_allocation_share(center.id, p_branch_id, month.month_start)
      end as branch_share
    from cost_centers center
    cross join report_months month
    where center.scope = 'shared'
  ),
  selected_payroll_runs as (
    select
      month.month_start,
      (
        select run.id
        from payroll_runs run
        where run.period_month = month.month_start
        order by case run.status when 'completed' then 0 else 1 end, run.created_at desc
        limit 1
      ) as run_id
    from report_months month
  ),
  labor_hourly as (
    select coalesce(sum(cost.labor_cost_lyd), 0) as hourly_lyd
    from shift_labor_cost cost
    cross join bounds
    where (p_branch_id is null or cost.branch_id = p_branch_id)
      and cost.clocked_in_at >= bounds.from_utc
      and cost.clocked_in_at < bounds.to_utc
      and not exists (
        select 1
        from profiles profile
        where profile.id = cost.user_id
          and coalesce(profile.monthly_salary, 0) > 0
      )
  ),
  shift_hours as (
    select
      cost.user_id,
      coalesce(sum(cost.hours) filter (where cost.branch_id = p_branch_id), 0)
        as branch_hours,
      coalesce(sum(cost.hours), 0) as total_hours
    from shift_labor_cost cost
    cross join bounds
    where cost.clocked_in_at >= bounds.from_utc
      and cost.clocked_in_at < bounds.to_utc
    group by cost.user_id
  ),
  payroll_run_salary_rows as (
    select
      selected.month_start,
      item.profile_id,
      item.branch_id,
      profile.payroll_cost_center_id,
      center.scope as payroll_scope,
      item.net_lyd
        * (
            least(p_to, (selected.month_start + interval '1 month' - interval '1 day')::date)
            - greatest(p_from, selected.month_start)
            + 1
          )::numeric
        / extract(day from (selected.month_start + interval '1 month' - interval '1 day')::date)
        as amount_lyd
    from selected_payroll_runs selected
    join payroll_run_items item on item.run_id = selected.run_id
    left join profiles profile on profile.id = item.profile_id
    left join cost_centers center on center.id = profile.payroll_cost_center_id
  ),
  payroll_estimate_salary_rows as (
    select
      selected.month_start,
      profile.id as profile_id,
      profile.branch_id,
      profile.payroll_cost_center_id,
      center.scope as payroll_scope,
      profile.monthly_salary
        * (
            least(p_to, (selected.month_start + interval '1 month' - interval '1 day')::date)
            - greatest(p_from, selected.month_start)
            + 1
          )::numeric
        / extract(day from (selected.month_start + interval '1 month' - interval '1 day')::date)
        as amount_lyd
    from selected_payroll_runs selected
    cross join profiles profile
    left join cost_centers center on center.id = profile.payroll_cost_center_id
    where selected.run_id is null
      and coalesce(profile.monthly_salary, 0) > 0
  ),
  salary_rows as (
    select * from payroll_run_salary_rows
    union all
    select * from payroll_estimate_salary_rows
  ),
  salary_allocated as (
    select
      salary.*,
      case
        when p_branch_id is null then 1::numeric
        when salary.payroll_scope = 'shared' then coalesce(share.branch_share, 0)
        when salary.branch_id = p_branch_id then 1::numeric
        when salary.branch_id is not null then 0::numeric
        when coalesce(hours.total_hours, 0) > 0
          then hours.branch_hours / hours.total_hours
        else 0::numeric
      end as branch_share
    from salary_rows salary
    left join shift_hours hours on hours.user_id = salary.profile_id
    left join shared_shares share
      on share.cost_center_id = salary.payroll_cost_center_id
     and share.month_start = salary.month_start
  ),
  labor_salary as (
    select
      coalesce(sum(amount_lyd * branch_share), 0) as salary_lyd,
      coalesce(
        sum(amount_lyd * branch_share) filter (where payroll_scope = 'shared'),
        0
      ) as shared_salary_lyd,
      count(distinct month_start) filter (
        where exists (
          select 1
          from selected_payroll_runs selected
          where selected.month_start = salary_allocated.month_start
            and selected.run_id is not null
        )
      ) as payroll_run_months
    from salary_allocated
  ),
  labor_adjustments_total as (
    select
      coalesce(sum(adjustment.amount_lyd) filter (
        where adjustment.kind in ('overtime', 'bonus')
      ), 0)
        - coalesce(sum(adjustment.amount_lyd) filter (
          where adjustment.kind = 'deduction'
        ), 0) as adjustments_lyd
    from labor_adjustments adjustment
    where adjustment.adjustment_date >= p_from
      and adjustment.adjustment_date <= p_to
      and (p_branch_id is null or adjustment.branch_id = p_branch_id)
      and not exists (
        select 1
        from payroll_runs run
        where run.period_month = date_trunc('month', adjustment.adjustment_date)::date
      )
  ),
  labor as (
    select
      (select hourly_lyd from labor_hourly)
        + (select salary_lyd from labor_salary)
        + (select adjustments_lyd from labor_adjustments_total) as labor_lyd,
      (select hourly_lyd from labor_hourly)
        + (
            (select salary_lyd from labor_salary)
            - (select shared_salary_lyd from labor_salary)
          )
        + (select adjustments_lyd from labor_adjustments_total) as direct_labor_lyd,
      (select shared_salary_lyd from labor_salary) as shared_labor_lyd
  ),
  canonical_expense_base as (
    select
      expense.id,
      expense.cost_center_id,
      center.scope,
      center.pos_branch_id,
      coalesce(expense.amount_lyd, 0) as amount_lyd,
      case
        when expense.coverage_months > 1 and expense.coverage_start is not null
          then expense.coverage_start
        else expense.expense_date
      end as recognition_start,
      case
        when expense.coverage_months > 1 and expense.coverage_start is not null
          then (
            expense.coverage_start
            + (expense.coverage_months || ' months')::interval
            - interval '1 day'
          )::date
        else expense.expense_date
      end as recognition_end
    from expenses expense
    left join cost_centers center on center.id = expense.cost_center_id
    where expense.status in ('approved', 'paid')
  ),
  canonical_expense_months as (
    select
      expense.id,
      expense.cost_center_id,
      expense.scope,
      expense.pos_branch_id,
      month.month_start,
      expense.amount_lyd
        * greatest(
            0,
            least(
              p_to,
              expense.recognition_end,
              (month.month_start + interval '1 month' - interval '1 day')::date
            )
            - greatest(p_from, expense.recognition_start, month.month_start)
            + 1
          )::numeric
        / greatest(1, expense.recognition_end - expense.recognition_start + 1)
        as recognized_lyd
    from canonical_expense_base expense
    cross join report_months month
    where expense.recognition_start <= p_to
      and expense.recognition_end >= p_from
      and expense.recognition_start
          <= (month.month_start + interval '1 month' - interval '1 day')::date
      and expense.recognition_end >= month.month_start
  ),
  opex_rows as (
    select
      coalesce(entry.amount_lyd, 0) as amount_lyd,
      entry.category = 'capex' as is_capex,
      false as is_shared
    from expense_entries entry
    where (p_branch_id is null or entry.branch_id = p_branch_id)
      and entry.paid_at >= p_from
      and entry.paid_at <= p_to
      and (entry.status is null or entry.status = 'approved')

    union all

    select
      expense.recognized_lyd * case
        when p_branch_id is null then 1
        when expense.scope = 'direct' and expense.pos_branch_id = p_branch_id then 1
        when expense.scope = 'shared' then coalesce(share.branch_share, 0)
        else 0
      end as amount_lyd,
      false as is_capex,
      expense.scope = 'shared' as is_shared
    from canonical_expense_months expense
    left join shared_shares share
      on share.cost_center_id = expense.cost_center_id
     and share.month_start = expense.month_start
  ),
  opex as (
    select
      coalesce(sum(amount_lyd) filter (where is_capex = false), 0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (
        where is_capex = false and is_shared
      ), 0) as shared_opex_lyd,
      coalesce(sum(amount_lyd) filter (where is_capex = true), 0) as capex_lyd
    from opex_rows
  ),
  cost_quality as (
    select count(distinct product.id) filter (
      where product.id is not null
        and (product.cost_lyd is null or product.cost_lyd <= 0)
    ) as missing_product_cost_count
    from pos_orders orders
    join pos_order_items item on item.order_id = orders.id
    left join pos_products product on product.id = item.product_id
    cross join bounds
    where (p_branch_id is null or orders.branch_id = p_branch_id)
      and orders.status = 'completed'
      and orders.created_at >= bounds.from_utc
      and orders.created_at < bounds.to_utc
  ),
  expense_quality as (
    select count(*) as unallocated_expense_count
    from canonical_expense_base expense
    where expense.recognition_start <= p_to
      and expense.recognition_end >= p_from
      and (expense.cost_center_id is null or coalesce(expense.scope, 'unallocated') = 'unallocated')
  )
  select jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'branch_id', p_branch_id,
    'net_of_refunds', p_net_of_refunds,
    'business_time_zone', 'Africa/Tripoli',
    'business_day_cutoff_hour', 5,
    'orders', (select orders_count from sales),
    'revenue_net', (select net_revenue from sales),
    'discounts', (select discounts from sales),
    'refunds', (select refunds from sales),
    'cogs', (select cogs_lyd from cogs) + (select modifier_cogs_lyd from modifier_cogs),
    'cogs_base', (select cogs_lyd from cogs),
    'cogs_modifiers', (select modifier_cogs_lyd from modifier_cogs),
    'labor', (select labor_lyd from labor),
    'labor_direct', (select direct_labor_lyd from labor),
    'labor_shared_allocated', (select shared_labor_lyd from labor),
    'labor_hourly', (select hourly_lyd from labor_hourly),
    'labor_salary', (select salary_lyd from labor_salary),
    'labor_adjustments', (select adjustments_lyd from labor_adjustments_total),
    'opex', (select opex_lyd from opex),
    'opex_direct', (select opex_lyd from opex) - (select shared_opex_lyd from opex),
    'opex_shared_allocated', (select shared_opex_lyd from opex),
    'shared_costs_allocated',
      (select shared_labor_lyd from labor) + (select shared_opex_lyd from opex),
    'capex', (select capex_lyd from opex),
    'prime_cost',
      (select cogs_lyd from cogs)
      + (select modifier_cogs_lyd from modifier_cogs)
      + (select direct_labor_lyd from labor),
    'net_contribution_before_shared',
      (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select modifier_cogs_lyd from modifier_cogs))
      - (select direct_labor_lyd from labor)
      - ((select opex_lyd from opex) - (select shared_opex_lyd from opex)),
    'net_contribution',
      (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select modifier_cogs_lyd from modifier_cogs))
      - (select labor_lyd from labor)
      - (select opex_lyd from opex),
    'data_quality', jsonb_build_object(
      'generated_at', now(),
      'latest_sale_at', (select latest_sale_at from sales),
      'missing_product_cost_count', (select missing_product_cost_count from cost_quality),
      'unallocated_expense_count', (select unallocated_expense_count from expense_quality),
      'payroll_run_months', (select payroll_run_months from labor_salary)
    )
  );
$$;

grant execute on function public.finance_pnl(uuid, date, date, boolean)
  to authenticated;

create or replace function public.finance_payment_reconciliation(
  p_branch_id uuid default null,
  p_from date default current_date,
  p_to date default current_date
)
returns table (
  order_count bigint,
  completed_sales numeric,
  cash_collected numeric,
  card_collected numeric,
  presto_collected numeric,
  other_collected numeric,
  refunds numeric,
  net_sales numeric,
  latest_order_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      ((p_from::timestamp + interval '5 hours') at time zone 'Africa/Tripoli') as from_utc,
      (((p_to + 1)::timestamp + interval '5 hours') at time zone 'Africa/Tripoli') as to_utc
  ),
  completed as (
    select
      orders.total,
      lower(coalesce(orders.payment_method, '')) as payment_method,
      greatest(least(coalesce(orders.card_amount, 0), coalesce(orders.total, 0)), 0) as split_card_amount,
      coalesce(orders.refunded_amount_lyd, 0) as refunded_amount_lyd,
      orders.created_at
    from pos_orders orders
    cross join bounds
    where orders.status = 'completed'
      and (p_branch_id is null or orders.branch_id = p_branch_id)
      and orders.created_at >= bounds.from_utc
      and orders.created_at < bounds.to_utc
  )
  select
    count(*)::bigint as order_count,
    coalesce(sum(total), 0) as completed_sales,
    coalesce(sum(
      case
        when payment_method = 'cash' then total
        when payment_method = 'split' then total - split_card_amount
        else 0
      end
    ), 0) as cash_collected,
    coalesce(sum(
      case
        when payment_method = 'card' then total
        when payment_method = 'split' then split_card_amount
        else 0
      end
    ), 0) as card_collected,
    coalesce(sum(case when payment_method = 'presto' then total else 0 end), 0)
      as presto_collected,
    coalesce(sum(
      case
        when payment_method not in ('cash', 'card', 'split', 'presto') then total
        else 0
      end
    ), 0) as other_collected,
    coalesce(sum(refunded_amount_lyd), 0) as refunds,
    coalesce(sum(total), 0) - coalesce(sum(refunded_amount_lyd), 0) as net_sales,
    max(created_at) as latest_order_at
  from completed;
$$;

grant execute on function public.finance_payment_reconciliation(uuid, date, date)
  to authenticated;

commit;
