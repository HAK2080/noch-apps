begin;

-- Keep the legacy gross view intact for existing integrations. This view is the
-- daily POS closing source: signed tender events include refunds, corrections,
-- voids and both legs of split payments in their actual business day.
create or replace view public.pos_sales_daily_reconciled
with (security_invoker = true) as
with order_days as (
  select
    branch_id,
    ((created_at at time zone 'Africa/Tripoli') - interval '5 hours')::date as day,
    count(*) filter (where status = 'completed') as orders,
    coalesce(sum(total) filter (where status = 'completed'), 0) as completed_sales,
    coalesce(sum(discount_amount) filter (where status = 'completed'), 0) as discounts,
    coalesce(sum(refunded_amount_lyd) filter (where status = 'completed'), 0) as linked_refunds
  from public.pos_orders
  group by branch_id, ((created_at at time zone 'Africa/Tripoli') - interval '5 hours')::date
), tender_days as (
  select
    branch_id,
    ((occurred_at at time zone 'Africa/Tripoli') - interval '5 hours')::date as day,
    coalesce(sum(signed_amount_lyd), 0) as net_sales,
    coalesce(sum(signed_amount_lyd) filter (where tender_type = 'cash'), 0) as cash_net,
    coalesce(sum(signed_amount_lyd) filter (where tender_type = 'card'), 0) as card_net,
    coalesce(sum(signed_amount_lyd) filter (where tender_type = 'presto'), 0) as presto_net,
    coalesce(sum(signed_amount_lyd) filter (where tender_type = 'other'), 0) as other_net,
    coalesce(-sum(signed_amount_lyd) filter (where event_type = 'refund'), 0) as period_refunds,
    coalesce(-sum(signed_amount_lyd) filter (where event_type = 'void'), 0) as period_voids
  from public.pos_tender_events
  group by branch_id, ((occurred_at at time zone 'Africa/Tripoli') - interval '5 hours')::date
)
select
  coalesce(o.branch_id, t.branch_id) as branch_id,
  coalesce(o.day, t.day) as day,
  coalesce(o.orders, 0) as orders,
  coalesce(o.completed_sales, 0) as completed_sales,
  coalesce(o.discounts, 0) as discounts,
  coalesce(o.linked_refunds, 0) as linked_refunds,
  coalesce(t.net_sales, 0) as net_sales,
  coalesce(t.cash_net, 0) as cash_net,
  coalesce(t.card_net, 0) as card_net,
  coalesce(t.presto_net, 0) as presto_net,
  coalesce(t.other_net, 0) as other_net,
  coalesce(t.period_refunds, 0) as period_refunds,
  coalesce(t.period_voids, 0) as period_voids,
  coalesce(o.completed_sales, 0) - coalesce(o.linked_refunds, 0)
    - coalesce(t.net_sales, 0) as order_tender_variance
from order_days o
full join tender_days t on t.branch_id = o.branch_id and t.day = o.day;

grant select on public.pos_sales_daily_reconciled to authenticated, service_role;
comment on view public.pos_sales_daily_reconciled is
  '05:00 Africa/Tripoli daily POS control. Net sales and payment types are signed tender movements; order_tender_variance exposes missing or timing-different payments.';

create or replace function public.daily_close_report_payload(p_branch_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with latest as (
    select d.* from public.pos_sales_daily_reconciled d
    where d.branch_id = p_branch_id
      and d.day < ((now() at time zone 'Africa/Tripoli') - interval '5 hours')::date
    order by d.day desc limit 1
  ), prior as (
    select d.* from public.pos_sales_daily_reconciled d, latest l
    where d.branch_id = p_branch_id and d.day = l.day - 7
  ), bounds as (
    select
      (l.day::timestamp + interval '5 hours') at time zone 'Africa/Tripoli' as from_at,
      ((l.day + 1)::timestamp + interval '5 hours') at time zone 'Africa/Tripoli' as to_at
    from latest l
  ), products as (
    select jsonb_agg(jsonb_build_object('name', x.product_name, 'qty', x.qty) order by x.qty desc) top_products
    from (
      select oi.product_name, sum(oi.quantity)::numeric qty
      from public.pos_orders o join public.pos_order_items oi on oi.order_id = o.id cross join bounds b
      where o.branch_id = p_branch_id and o.status = 'completed'
        and o.created_at >= b.from_at and o.created_at < b.to_at
      group by oi.product_name order by qty desc limit 3
    ) x
  ), loyalty as (
    select coalesce(sum(a.stamp_count), 0)::bigint stamps
    from public.loyalty_order_awards a join public.pos_orders o on o.id = a.order_id cross join bounds b
    where o.branch_id = p_branch_id and a.awarded_at >= b.from_at and a.awarded_at < b.to_at
  ), snaps as (
    select count(*)::bigint snapped_expenses from public.expense_snaps s cross join bounds b
    where s.created_at >= b.from_at and s.created_at < b.to_at
  )
  select jsonb_build_object(
    'branch_id', b.id, 'branch_name', b.name, 'day', l.day,
    'orders', l.orders, 'completed_sales', l.completed_sales,
    'net_sales', l.net_sales, 'cash', l.cash_net, 'card', l.card_net,
    'presto', l.presto_net, 'other', l.other_net,
    'refunds', l.period_refunds, 'order_tender_variance', l.order_tender_variance,
    'last_week_net_sales', p.net_sales,
    'net_change_pct', round(100 * (l.net_sales - p.net_sales) / nullif(p.net_sales, 0), 1),
    'top_products', coalesce(products.top_products, '[]'::jsonb),
    'stamps', loyalty.stamps, 'snapped_expenses', snaps.snapped_expenses
  )
  from public.pos_branches b
  join latest l on true
  left join prior p on true
  cross join products cross join loyalty cross join snaps
  where b.id = p_branch_id;
$$;

grant execute on function public.daily_close_report_payload(uuid) to service_role, authenticated;

commit;
