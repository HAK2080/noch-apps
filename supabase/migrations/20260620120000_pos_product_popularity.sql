-- POS product popularity ranking.
--
-- Powers the auto-sorting product grid: the more a product sells, the
-- higher it floats in the cashier's grid. Uses a rolling 30-day window so
-- the ranking reflects what's selling *lately* and stays stable within a
-- shift (a single day's sales barely move a 30-day total), while adapting
-- day to day as buying patterns change.

-- Indexes to keep the aggregation cheap as order history grows.
create index if not exists idx_pos_order_items_product
  on pos_order_items (product_id);
create index if not exists idx_pos_orders_branch_created
  on pos_orders (branch_id, created_at);

-- Returns units sold per product over the last 30 days for a branch
-- (or all branches when p_branch_id is null). Voided orders are excluded.
create or replace function get_product_popularity(p_branch_id uuid default null)
returns table (product_id uuid, units_sold bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select oi.product_id, sum(oi.quantity)::bigint as units_sold
  from pos_order_items oi
  join pos_orders o on o.id = oi.order_id
  where o.created_at >= now() - interval '30 days'
    and o.voided_at is null
    and oi.product_id is not null
    and (p_branch_id is null or o.branch_id = p_branch_id)
  group by oi.product_id;
$$;

grant execute on function get_product_popularity(uuid) to authenticated, anon;
