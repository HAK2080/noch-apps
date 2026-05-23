-- Wire the standalone Expenses module into finance_pnl (2026-05-23).
--
-- Root cause: finance_pnl read only expense_entries (Finance module's own
-- simpler table). The company's real approved expenses live in the `expenses`
-- table (ExpensesPage module) with proper cost-center / approval workflow.
-- These 19+ approved entries were not appearing in P&L at all.
--
-- Fix: update the opex CTE to UNION both sources:
--   • expense_entries  — Finance tab manual entries (backward compat)
--   • expenses         — Canonical expense module, status IN ('approved','paid')
--
-- No destructive changes. expense_entries is kept so any existing rows there
-- are still counted.

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
      coalesce(sum(case when status='completed' then total else 0 end), 0)
        - case when p_net_of_refunds then coalesce(sum(refunded_amount_lyd),0) else 0 end as net_revenue,
      coalesce(sum(case when status='completed' then discount_amount else 0 end), 0) as discounts,
      coalesce(sum(refunded_amount_lyd),0) as refunds,
      count(*) filter (where status='completed') as orders_count
    from pos_orders
    where (p_branch_id is null or branch_id = p_branch_id)
      and created_at >= p_from::timestamptz
      and created_at <  (p_to + interval '1 day')::timestamptz
  ),
  cogs as (
    select coalesce(sum(coalesce(pp.cost_lyd, 0) * oi.quantity), 0) as cogs_lyd
    from pos_orders o
    join pos_order_items oi on oi.order_id = o.id
    left join pos_products pp on pp.id = oi.product_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.created_at >= p_from::timestamptz
      and o.created_at <  (p_to + interval '1 day')::timestamptz
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
      and o.created_at <  (p_to + interval '1 day')::timestamptz
      and o.status = 'completed'
  ),
  labor as (
    select coalesce(sum(labor_cost_lyd),0) as labor_lyd
    from shift_labor_cost slc
    where (p_branch_id is null or slc.branch_id = p_branch_id)
      and slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at <  (p_to + interval '1 day')::timestamptz
  ),
  opex as (
    -- UNION: Finance-module entries + canonical Expenses-module entries.
    -- expense_entries.category = 'capex' is flagged separately so it lands
    -- in the capex bucket rather than opex.  All expenses-module rows are
    -- treated as opex (CapEx is tracked separately via finance_capex table).
    select
      coalesce(sum(amount_lyd) filter (where is_capex = false), 0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (where is_capex = true),  0) as capex_lyd
    from (
      -- Source 1: Finance module's expense_entries
      select
        coalesce(amount_lyd, 0) as amount_lyd,
        (category = 'capex')    as is_capex
      from expense_entries
      where (p_branch_id is null or branch_id = p_branch_id or branch_id is null)
        and paid_at >= p_from
        and paid_at <= p_to
        and (status is null or status = 'approved')

      union all

      -- Source 2: Standalone Expenses module (only approved / paid)
      select
        coalesce(amount_lyd, 0) as amount_lyd,
        false                   as is_capex
      from expenses
      where status in ('approved', 'paid')
        and expense_date >= p_from
        and expense_date <= p_to
    ) combined
  )
  select jsonb_build_object(
    'period_from',       p_from,
    'period_to',         p_to,
    'branch_id',         p_branch_id,
    'net_of_refunds',    p_net_of_refunds,
    'orders',            (select orders_count from sales),
    'revenue_net',       (select net_revenue from sales),
    'discounts',         (select discounts from sales),
    'refunds',           (select refunds from sales),
    'cogs',              (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs),
    'cogs_base',         (select cogs_lyd from cogs),
    'cogs_modifiers',    (select mod_cogs_lyd from modifier_cogs),
    'labor',             (select labor_lyd from labor),
    'opex',              (select opex_lyd from opex),
    'capex',             (select capex_lyd from opex),
    'prime_cost',        (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs) + (select labor_lyd from labor),
    'net_contribution',
        (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs))
      - (select labor_lyd from labor)
      - (select opex_lyd from opex)
  );
$$;
grant execute on function public.finance_pnl(uuid, date, date, boolean) to authenticated;
