-- Reconcile session payment totals with net revenue.
-- Partial refunds reduce pos_shifts.total_sales, while the historical
-- payment buckets remain gross. Reporting uses this aggregate to deduct
-- refunds from the cash leg (the refund workflow returns cash).
create or replace function public.pos_shift_refund_totals(p_shift_ids uuid[])
returns table (shift_id uuid, refunded_total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.shift_id,
    sum(oi.unit_price * greatest(coalesce(oi.refunded_qty, 0), 0))::numeric as refunded_total
  from pos_orders o
  join pos_order_items oi on oi.order_id = o.id
  where o.shift_id = any(p_shift_ids)
    and coalesce(oi.refunded_qty, 0) > 0
  group by o.shift_id;
$$;

grant execute on function public.pos_shift_refund_totals(uuid[]) to authenticated;
