-- Correct branch P&L allocation and make branch operating state explicit.
--
-- Canonical expenses are assigned through cost_centers.cost_center_id. The
-- previous finance_pnl version counted every canonical expense for every
-- branch, which made a pre-opening branch appear to carry the whole company
-- overhead. Consolidated P&L still includes all approved/paid expenses;
-- branch P&Ls include only expenses assigned to that branch's cost center.

alter table public.pos_branches
  add column if not exists operational_status text not null default 'operating';

do $$
begin
  alter table public.pos_branches
    add constraint pos_branches_operational_status_check
    check (operational_status in ('operating', 'pre_opening', 'closed'));
exception
  when duplicate_object then null;
end $$;

update public.pos_branches
set operational_status = 'pre_opening'
where name ilike '%Jaraba%'
   or name ilike '%Gallery Mall%';

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
  labor as (
    select coalesce(sum(labor_cost_lyd), 0) as labor_lyd
    from shift_labor_cost slc
    where (p_branch_id is null or slc.branch_id = p_branch_id)
      and slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at < (p_to + interval '1 day')::timestamptz
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
      select
        coalesce(e.amount_lyd, 0) as amount_lyd,
        false as is_capex
      from expenses e
      left join cost_centers cc on cc.id::text = e.cost_center_id::text
      where e.status in ('approved', 'paid')
        and e.expense_date >= p_from
        and e.expense_date <= p_to
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
