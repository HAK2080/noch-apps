-- Add cost_lyd and profit to pos_sales_by_product RPC so POSReports
-- can show COGS and profit per product without a second query.

drop function if exists public.pos_sales_by_product(uuid, timestamptz, timestamptz);

create or replace function public.pos_sales_by_product(
  p_branch_id uuid,
  p_from timestamptz,
  p_to   timestamptz
) returns table (
  product_id uuid,
  product_name text,
  qty numeric,
  revenue numeric,
  cogs numeric,
  profit numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    oi.product_id,
    coalesce(oi.product_name, '(deleted)'),
    sum(oi.quantity)::numeric,
    sum(oi.total)::numeric,
    sum(oi.quantity * coalesce(pp.cost_lyd, 0))::numeric,
    (sum(oi.total) - sum(oi.quantity * coalesce(pp.cost_lyd, 0)))::numeric
    from pos_order_items oi
    join pos_orders o on o.id = oi.order_id
    left join pos_products pp on pp.id = oi.product_id
    where o.branch_id = p_branch_id
      and o.status = 'completed'
      and o.created_at >= p_from
      and o.created_at <  p_to
    group by oi.product_id, oi.product_name
    order by sum(oi.total) desc;
$$;
