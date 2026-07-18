-- ============================================================
-- BUSINESS-DAY SALES BUCKETING (applied 2026-07-17)
-- Cafes trade 9 AM → ~1 AM next day. A trading "day" runs 5 AM → 5 AM
-- Africa/Tripoli, so post-midnight sales count toward the evening's day.
-- Previously the view used date_trunc('day', created_at) in UTC, which both
-- shifted days (UTC vs UTC+2) and split one trading night across two days.
-- Keep the 5 AM cutoff in sync with BUSINESS_DAY_CUTOFF_H in
-- apps/pos/src/modules/pos/lib/pos-supabase.js.
-- ============================================================

create or replace view pos_sales_daily as
select
  branch_id,
  (date_trunc('day', (created_at at time zone 'Africa/Tripoli') - interval '5 hours'))::date as day,
  count(*) filter (where status = 'completed') as orders,
  sum(total) filter (where status = 'completed') as gross,
  sum(discount_amount) filter (where status = 'completed') as discounts,
  sum(total) filter (where status = 'completed' and payment_method = 'cash')   as cash_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'card')   as card_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'split')  as split_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'presto') as presto_sales,
  sum(total) filter (where status = 'voided') as voided
from pos_orders
group by branch_id, (date_trunc('day', (created_at at time zone 'Africa/Tripoli') - interval '5 hours'));

grant select on pos_sales_daily to authenticated;
