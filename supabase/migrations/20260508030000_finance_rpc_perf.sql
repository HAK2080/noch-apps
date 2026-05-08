-- Finance RPC perf fix (2026-05-08).
-- The first version of finance_pnl + finance_menu_matrix used
--   where created_at::date >= p_from and created_at::date <= p_to
-- which prevents Postgres from using the (created_at) index on
-- pos_orders. On any DB with non-trivial order history this turns the
-- /finance Daily P&L tab into a render-hang while the RPC runs.
--
-- Fix: use timestamp-range comparisons instead of ::date casts.
--   created_at >= p_from
--   created_at <  p_to + interval '1 day'
-- Same logical period, but Postgres now seeks the index.
--
-- No schema changes — only function bodies.

create or replace function public.finance_pnl(
  p_branch_id uuid,
  p_from date,
  p_to   date
) returns jsonb
language sql stable security definer
set search_path = public
as $$
  with sales as (
    select
      coalesce(sum(case when status='completed' then total else 0 end), 0) as net_revenue,
      coalesce(sum(case when status='completed' then discount_amount else 0 end), 0) as discounts,
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
  labor as (
    select coalesce(sum(labor_cost_lyd),0) as labor_lyd
    from shift_labor_cost slc
    where (p_branch_id is null or slc.branch_id = p_branch_id)
      and slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at <  (p_to + interval '1 day')::timestamptz
  ),
  opex as (
    select
      coalesce(sum(amount_lyd) filter (where category not in ('capex')),0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (where category = 'capex'),0)        as capex_lyd
    from expense_entries
    where (p_branch_id is null or branch_id = p_branch_id or branch_id is null)
      and paid_at >= p_from and paid_at <= p_to
  )
  select jsonb_build_object(
    'period_from',  p_from,
    'period_to',    p_to,
    'branch_id',    p_branch_id,
    'orders',       (select orders_count from sales),
    'revenue_net',  (select net_revenue from sales),
    'discounts',    (select discounts from sales),
    'cogs',         (select cogs_lyd from cogs),
    'labor',        (select labor_lyd from labor),
    'opex',         (select opex_lyd from opex),
    'capex',        (select capex_lyd from opex),
    'prime_cost',   (select cogs_lyd from cogs) + (select labor_lyd from labor),
    'net_contribution',
        (select net_revenue from sales)
      - (select cogs_lyd from cogs)
      - (select labor_lyd from labor)
      - (select opex_lyd from opex)
  );
$$;

create or replace function public.finance_menu_matrix(
  p_branch_id uuid,
  p_from date,
  p_to   date
) returns table (
  product_id uuid,
  product_name text,
  recipe_id uuid,
  has_cost boolean,
  unit_price numeric,
  unit_cost numeric,
  contribution_margin numeric,
  contribution_margin_ratio numeric,
  units_sold numeric,
  revenue numeric,
  total_contribution numeric
)
language sql stable security definer
set search_path = public
as $$
  with sold as (
    select
      oi.product_id,
      max(oi.product_name) as product_name,
      sum(oi.quantity)::numeric as units_sold,
      sum(oi.total)::numeric as revenue,
      max(oi.unit_price) as unit_price
    from pos_order_items oi
    join pos_orders o on o.id = oi.order_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.status = 'completed'
      and o.created_at >= p_from::timestamptz
      and o.created_at <  (p_to + interval '1 day')::timestamptz
    group by oi.product_id
  )
  select
    s.product_id,
    s.product_name,
    null::uuid as recipe_id,
    (coalesce(pp.cost_lyd, 0) > 0) as has_cost,
    s.unit_price,
    coalesce(pp.cost_lyd, 0)::numeric as unit_cost,
    (s.unit_price - coalesce(pp.cost_lyd, 0))::numeric as contribution_margin,
    case when s.unit_price > 0
         then (s.unit_price - coalesce(pp.cost_lyd, 0)) / s.unit_price
         else 0 end as contribution_margin_ratio,
    s.units_sold,
    s.revenue,
    ((s.unit_price - coalesce(pp.cost_lyd, 0)) * s.units_sold)::numeric as total_contribution
  from sold s
  left join pos_products pp on pp.id = s.product_id;
$$;

-- Helpful indexes (safe to add even if duplicates exist; CONCURRENTLY
-- not used because we want this to run in a transaction with the rest).
create index if not exists pos_orders_branch_created_status_idx
  on pos_orders (branch_id, created_at desc, status);
create index if not exists pos_order_items_order_idx
  on pos_order_items (order_id);
create index if not exists pos_shift_attendees_branch_clocked_idx
  on pos_shift_attendees (branch_id, clocked_in_at desc);
