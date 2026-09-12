begin;
-- Rank fulfilled sales, net of item returns. Pending/cancelled baskets must
-- not displace the products workers actually sell most often.
create or replace function public.get_product_popularity(p_branch_id uuid default null)
returns table(product_id uuid, units_sold bigint)
language sql stable security invoker set search_path=public as $$
  select oi.product_id, sum(greatest(oi.quantity-coalesce(oi.refunded_qty,0),0))::bigint
  from pos_order_items oi join pos_orders o on o.id=oi.order_id
  where o.created_at>=now()-interval '30 days'
    and o.created_at<=now()
    and o.status='completed' and o.voided_at is null
    and oi.product_id is not null
    and (p_branch_id is null or o.branch_id=p_branch_id)
  group by oi.product_id
  having sum(greatest(oi.quantity-coalesce(oi.refunded_qty,0),0))>0;
$$;
commit;
