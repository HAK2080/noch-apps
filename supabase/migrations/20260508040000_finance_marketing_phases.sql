-- Finance Phase 1.1 + Phase 3 + Marketing Phase 4 (2026-05-08).
-- One migration, pure additions.

-- ──────────────────────────────────────────────────────────────────
-- Phase 1.1: modifier cost tracking + refund-net P&L
-- ──────────────────────────────────────────────────────────────────
alter table pos_modifiers
  add column if not exists cost_delta_lyd numeric(10,2) default 0;

alter table pos_orders
  add column if not exists refunded_amount_lyd numeric(10,2) default 0;

-- Refund total denormalised onto pos_orders for fast P&L. Backfill from
-- existing partial refunds (pos_order_items.refunded_qty × unit_price).
update pos_orders o
   set refunded_amount_lyd = coalesce((
     select sum(oi.refunded_qty * oi.unit_price)
       from pos_order_items oi
       where oi.order_id = o.id and oi.refunded_qty > 0
   ), 0)
 where refunded_amount_lyd = 0;

-- ──────────────────────────────────────────────────────────────────
-- Phase 3 Finance: budgets + CapEx + forecast scenarios
-- ──────────────────────────────────────────────────────────────────
create table if not exists finance_budgets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references pos_branches(id),
  period_month date not null,                 -- first-of-month
  category text not null,                     -- same enum as expense_entries
  budgeted_amount_lyd numeric(12,2) not null,
  notes text,
  created_at timestamptz default now()
);
create unique index if not exists finance_budgets_unique_idx
  on finance_budgets (coalesce(branch_id::text, ''), period_month, category);

alter table finance_budgets enable row level security;
create policy "finance_budgets_owner" on finance_budgets
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create table if not exists finance_capex (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references pos_branches(id),
  name text not null,
  vendor text,
  acquired_at date not null,
  cost_lyd numeric(12,2) not null,
  expected_life_months int default 60,
  expected_monthly_contribution_lyd numeric(10,2) default 0,
  -- if owner records actuals later this gets compared to expected
  notes text,
  receipt_url text,
  retired_at date,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);
alter table finance_capex enable row level security;
create policy "finance_capex_owner" on finance_capex
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create table if not exists finance_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid references pos_branches(id),
  matcha_cost_pct_delta numeric(5,2) default 0,
  sales_volume_pct_delta numeric(5,2) default 0,
  labor_headcount_delta int default 0,
  baseline_period_from date,
  baseline_period_to date,
  notes text,
  saved_at timestamptz default now(),
  saved_by uuid references profiles(id)
);
alter table finance_scenarios enable row level security;
create policy "finance_scenarios_owner" on finance_scenarios
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ──────────────────────────────────────────────────────────────────
-- Phase 4 Marketing: campaigns + reviews/reputation + content calendar
-- (calendar is a read-mostly view layered on existing content_posts)
-- ──────────────────────────────────────────────────────────────────
create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text check (segment in ('vip','regular','occasional','at_risk','churned','new','all')),
  channel text check (channel in ('whatsapp','sms','email','in_app','manual')),
  message_template text,
  promo_code text,                  -- optional; matched against pos_orders for redemption
  expected_revenue_lyd numeric(12,2) default 0,
  cost_lyd numeric(10,2) default 0, -- ad spend or producer cost
  scheduled_for timestamptz,
  status text default 'draft' check (status in ('draft','scheduled','sent','complete','cancelled')),
  notes text,
  created_at timestamptz default now(),
  sent_at timestamptz,
  created_by uuid references profiles(id)
);
create index if not exists marketing_campaigns_status_idx on marketing_campaigns (status, scheduled_for);

alter table marketing_campaigns enable row level security;
create policy "marketing_campaigns_owner" on marketing_campaigns
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create table if not exists marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  loyalty_customer_id uuid references loyalty_customers(id) on delete set null,
  phone text,
  status text default 'pending' check (status in ('pending','sent','failed','redeemed')),
  redeemed_order_id uuid references pos_orders(id),
  redeemed_at timestamptz,
  sent_at timestamptz
);
create unique index if not exists marketing_campaign_recipients_unique_idx
  on marketing_campaign_recipients (campaign_id, coalesce(loyalty_customer_id::text, phone));
create index if not exists marketing_campaign_recipients_campaign_idx on marketing_campaign_recipients (campaign_id);
alter table marketing_campaign_recipients enable row level security;
create policy "marketing_campaign_recipients_owner" on marketing_campaign_recipients
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- Reputation inbox: aggregator for reviews / DMs / comments. v1 = manual
-- entry + future hooks for GBP API, IG API.
create table if not exists marketing_reviews (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('google','instagram','facebook','tiktok','whatsapp','manual')),
  external_id text,
  author_name text,
  rating int check (rating between 1 and 5),
  text text,
  text_lang text,
  sentiment text check (sentiment in ('positive','neutral','negative','question')),
  status text default 'new' check (status in ('new','replied','snoozed','flagged')),
  reply_text text,
  replied_at timestamptz,
  replied_by uuid references profiles(id),
  posted_at timestamptz,
  ingested_at timestamptz default now(),
  raw jsonb
);
create index if not exists marketing_reviews_status_idx on marketing_reviews (status, posted_at desc);
alter table marketing_reviews enable row level security;
create policy "marketing_reviews_owner" on marketing_reviews
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ──────────────────────────────────────────────────────────────────
-- OCR invoice extras (pending-review state + receipt photos)
-- Per features-2026.md §M.
-- ──────────────────────────────────────────────────────────────────
alter table expense_entries
  add column if not exists status text default 'approved' check (status in ('pending_review','approved')),
  add column if not exists ocr_confidence numeric(3,2),
  add column if not exists ocr_raw_response jsonb,
  add column if not exists invoice_number text,
  add column if not exists currency text default 'LYD',
  add column if not exists fx_rate_lyd numeric(8,4);

-- ──────────────────────────────────────────────────────────────────
-- Updated finance_pnl with refund-net + modifier-cost + budgets
-- (timestamp range predicates, indexes already in 030000)
-- ──────────────────────────────────────────────────────────────────
create or replace function public.finance_pnl(
  p_branch_id uuid,
  p_from date,
  p_to   date,
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
    -- product unit cost × qty. Modifier-cost is computed separately
    -- in the modifier_cogs CTE below and added in the final select.
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
    -- separate CTE so we can reference pos_modifiers without breaking
    -- existing columns when the table doesn't yet have cost_delta_lyd
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
    select
      coalesce(sum(amount_lyd) filter (where category not in ('capex')),0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (where category = 'capex'),0)        as capex_lyd
    from expense_entries
    where (p_branch_id is null or branch_id = p_branch_id or branch_id is null)
      and paid_at >= p_from and paid_at <= p_to
      and (status is null or status = 'approved')
  )
  select jsonb_build_object(
    'period_from',  p_from,
    'period_to',    p_to,
    'branch_id',    p_branch_id,
    'net_of_refunds', p_net_of_refunds,
    'orders',       (select orders_count from sales),
    'revenue_net',  (select net_revenue from sales),
    'discounts',    (select discounts from sales),
    'refunds',      (select refunds from sales),
    'cogs',         (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs),
    'cogs_base',    (select cogs_lyd from cogs),
    'cogs_modifiers', (select mod_cogs_lyd from modifier_cogs),
    'labor',        (select labor_lyd from labor),
    'opex',         (select opex_lyd from opex),
    'capex',        (select capex_lyd from opex),
    'prime_cost',   (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs) + (select labor_lyd from labor),
    'net_contribution',
        (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs))
      - (select labor_lyd from labor)
      - (select opex_lyd from opex)
  );
$$;
grant execute on function public.finance_pnl(uuid, date, date, boolean) to authenticated;

-- Variance vs budget RPC.
create or replace function public.finance_variance(
  p_branch_id uuid,
  p_period_month date  -- first-of-month
) returns table (
  category text,
  budgeted numeric,
  actual numeric,
  variance numeric,
  variance_pct numeric
)
language sql stable security definer
set search_path = public
as $$
  with month_range as (
    select date_trunc('month', p_period_month)::date as start_d,
           (date_trunc('month', p_period_month) + interval '1 month' - interval '1 day')::date as end_d
  ),
  budgeted as (
    select category, sum(budgeted_amount_lyd) as budgeted_amount
    from finance_budgets, month_range
    where period_month = month_range.start_d
      and (p_branch_id is null or branch_id = p_branch_id or branch_id is null)
    group by category
  ),
  actuals as (
    select category, sum(amount_lyd) as actual_amount
    from expense_entries, month_range
    where paid_at between month_range.start_d and month_range.end_d
      and (p_branch_id is null or branch_id = p_branch_id or branch_id is null)
      and (status is null or status = 'approved')
    group by category
  ),
  combined as (
    select coalesce(b.category, a.category) as category,
           coalesce(b.budgeted_amount, 0) as budgeted,
           coalesce(a.actual_amount, 0)   as actual
    from budgeted b
    full outer join actuals a using (category)
  )
  select
    category,
    budgeted,
    actual,
    actual - budgeted as variance,
    case when budgeted > 0 then (actual - budgeted) / budgeted * 100 else null end as variance_pct
  from combined
  order by abs(actual - budgeted) desc;
$$;
grant execute on function public.finance_variance(uuid, date) to authenticated;

-- Forecast next-N-days from a baseline, with scenario adjustments.
create or replace function public.finance_forecast(
  p_branch_id uuid,
  p_baseline_from date,
  p_baseline_to date,
  p_horizon_days int default 90,
  p_matcha_cost_pct_delta numeric default 0,
  p_sales_volume_pct_delta numeric default 0,
  p_labor_headcount_delta int default 0
) returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_baseline jsonb;
  v_baseline_days int;
  v_scale numeric;
  v_revenue numeric;
  v_cogs numeric;
  v_labor numeric;
  v_opex numeric;
begin
  v_baseline := finance_pnl(p_branch_id, p_baseline_from, p_baseline_to, false);
  v_baseline_days := (p_baseline_to - p_baseline_from) + 1;
  v_scale := p_horizon_days::numeric / nullif(v_baseline_days, 0);
  v_revenue := (v_baseline->>'revenue_net')::numeric * v_scale * (1 + p_sales_volume_pct_delta / 100.0);
  v_cogs    := (v_baseline->>'cogs')::numeric        * v_scale * (1 + p_sales_volume_pct_delta / 100.0)
               * (1 + p_matcha_cost_pct_delta / 100.0);
  v_labor   := (v_baseline->>'labor')::numeric       * v_scale + (p_labor_headcount_delta * 1500.0);
                  -- assume +1500 LYD/month baseline per FTE delta — owner can edit
  v_opex    := (v_baseline->>'opex')::numeric        * v_scale;

  return jsonb_build_object(
    'horizon_days', p_horizon_days,
    'baseline_from', p_baseline_from,
    'baseline_to', p_baseline_to,
    'matcha_cost_pct_delta', p_matcha_cost_pct_delta,
    'sales_volume_pct_delta', p_sales_volume_pct_delta,
    'labor_headcount_delta', p_labor_headcount_delta,
    'projected_revenue', v_revenue,
    'projected_cogs',    v_cogs,
    'projected_labor',   v_labor,
    'projected_opex',    v_opex,
    'projected_net',     v_revenue - v_cogs - v_labor - v_opex
  );
end;
$$;
grant execute on function public.finance_forecast(uuid, date, date, int, numeric, numeric, int) to authenticated;
