-- Marketing MVP (2026-05-08).
-- Per docs/marketing/01-mvp-plan.md.
-- Pure additions; no destructive changes.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Per-account daily snapshots (followers, reach, engagement)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists marketing_channel_snapshots (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in (
    'instagram','tiktok','facebook','google_business','whatsapp'
  )),
  account_label text,                 -- e.g. '@noch.cafe'
  snapshot_date date not null,
  -- generic
  followers int,
  reach int,
  profile_visits int,
  link_clicks int,
  impressions int,
  engagement_rate numeric(6,2),
  -- google business specific
  review_count int,
  avg_rating numeric(3,2),
  direction_requests int,
  phone_calls int,
  -- whatsapp specific
  messages_sent int,
  messages_delivered int,
  messages_read int,
  -- bookkeeping
  source text default 'manual'
    check (source in ('manual','api')),
  raw jsonb,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);
-- One snapshot per (channel, account, date).
create unique index if not exists marketing_channel_snapshots_unique
  on marketing_channel_snapshots
  (channel, coalesce(account_label, ''), snapshot_date);
create index if not exists marketing_channel_snapshots_chan_idx
  on marketing_channel_snapshots (channel, snapshot_date desc);

alter table marketing_channel_snapshots enable row level security;
drop policy if exists "marketing_channel_snapshots_owner_only" on marketing_channel_snapshots;
create policy "marketing_channel_snapshots_owner_only"
  on marketing_channel_snapshots
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ──────────────────────────────────────────────────────────────────────
-- 2. Customer marketing flags + phone normalisation
-- ──────────────────────────────────────────────────────────────────────
alter table loyalty_customers
  add column if not exists marketing_opt_in boolean default true,
  add column if not exists last_marketing_contact_at timestamptz,
  add column if not exists phone_normalised text;

-- One-shot backfill. Libyan numbering rules:
--   "+218 91 234 5678" → "+218912345678"
--   "0912345678"        → "+218912345678"
--   "912345678"         → "+218912345678"
update loyalty_customers
   set phone_normalised = (
     case
       when phone ~ '^\+218'         then regexp_replace(phone, '\s|-', '', 'g')
       when phone ~ '^0'             then '+218' || regexp_replace(regexp_replace(phone, '\s|-', '', 'g'), '^0+', '')
       when phone ~ '^9' and length(regexp_replace(phone, '\D', '', 'g')) = 9
                                     then '+218' || regexp_replace(phone, '\D', '', 'g')
       else regexp_replace(phone, '\s|-', '', 'g')
     end
   )
 where phone_normalised is null;

create index if not exists loyalty_customers_phone_norm_idx
  on loyalty_customers (phone_normalised);

-- View: report duplicates created by inconsistent formatting.
-- Owner reviews + manually merges (not auto).
create or replace view loyalty_customer_duplicates as
select phone_normalised, count(*) as dup_count, array_agg(id order by created_at) as customer_ids
from loyalty_customers
where phone_normalised is not null and length(phone_normalised) > 0
group by phone_normalised
having count(*) > 1;
grant select on loyalty_customer_duplicates to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Customer segments (RFM-derived; refreshed nightly)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists customer_segments (
  customer_id uuid primary key references loyalty_customers(id) on delete cascade,
  segment text not null check (segment in (
    'vip','regular','occasional','at_risk','churned','new'
  )),
  recency_score   int check (recency_score   between 1 and 5),
  frequency_score int check (frequency_score between 1 and 5),
  monetary_score  int check (monetary_score  between 1 and 5),
  rfm_composite int,                  -- R*100 + F*10 + M
  total_visits int default 0,
  total_spend_lyd numeric(12,2) default 0,
  last_visit_at timestamptz,
  computed_at timestamptz default now()
);
create index if not exists customer_segments_seg_idx on customer_segments (segment);

alter table customer_segments enable row level security;
drop policy if exists "customer_segments_authenticated_select" on customer_segments;
create policy "customer_segments_authenticated_select"
  on customer_segments for select to authenticated using (true);
-- writes only via the RPC below.

create or replace function public.refresh_customer_segments()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  with base as (
    select
      lc.id as customer_id,
      lc.created_at as customer_created_at,
      coalesce(max(o.created_at), max(s.created_at)) as last_seen,
      count(distinct date_trunc('day', coalesce(o.created_at, s.created_at)))
                                                     as visits,
      coalesce(sum(o.total) filter (where o.status='completed'), 0) as spend
    from loyalty_customers lc
    left join pos_orders o
      on o.loyalty_customer_id = lc.id
     and o.created_at >= v_now - interval '180 days'
    left join loyalty_stamps s
      on s.customer_id = lc.id
     and s.created_at >= v_now - interval '180 days'
    group by lc.id, lc.created_at
  ),
  scored as (
    select
      customer_id,
      customer_created_at,
      last_seen,
      visits,
      spend,
      case
        when last_seen is null then 1
        when last_seen >= v_now - interval '7 days'  then 5
        when last_seen >= v_now - interval '14 days' then 4
        when last_seen >= v_now - interval '30 days' then 3
        when last_seen >= v_now - interval '60 days' then 2
        else 1
      end as r,
      case
        when visits >= 12 then 5
        when visits >=  6 then 4
        when visits >=  3 then 3
        when visits >=  1 then 2
        else 1
      end as f,
      coalesce(
        case when spend > 0 then ntile(5) over (order by spend) else 1 end,
        1
      ) as m
    from base
  ),
  segmented as (
    select
      customer_id, customer_created_at, last_seen, visits, spend, r, f, m,
      r*100 + f*10 + m as composite,
      case
        when customer_created_at >= v_now - interval '14 days' and visits <= 1 then 'new'
        when last_seen is null then 'churned'
        when r >= 4 and m >= 5 then 'vip'
        when r >= 4 and f >= 3 then 'regular'
        when r in (2,3) and f >= 3 then 'at_risk'
        when r = 1 then 'churned'
        else 'occasional'
      end as segment
    from scored
  )
  insert into customer_segments
    (customer_id, segment, recency_score, frequency_score, monetary_score,
     rfm_composite, total_visits, total_spend_lyd, last_visit_at, computed_at)
    select customer_id, segment, r, f, m, composite, visits, spend, last_seen, v_now
      from segmented
    on conflict (customer_id) do update
      set segment = excluded.segment,
          recency_score = excluded.recency_score,
          frequency_score = excluded.frequency_score,
          monetary_score = excluded.monetary_score,
          rfm_composite = excluded.rfm_composite,
          total_visits = excluded.total_visits,
          total_spend_lyd = excluded.total_spend_lyd,
          last_visit_at = excluded.last_visit_at,
          computed_at = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.refresh_customer_segments() to authenticated;

-- Schedule nightly. (cron extension already created by earlier loyalty migrations.)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-customer-segments') then
    perform cron.unschedule('refresh-customer-segments');
  end if;
end $$;
select cron.schedule(
  'refresh-customer-segments',
  '15 4 * * *',  -- 04:15 UTC = 07:15 Africa/Tripoli, after Nochi state job
  $$ select public.refresh_customer_segments(); $$
);

-- ──────────────────────────────────────────────────────────────────────
-- 4. Cohort retention RPC
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.cohort_retention(
  p_months int default 6
) returns table (
  cohort_month date,
  cohort_size int,
  month_offset int,
  active_customers int,
  retention_pct numeric
)
language sql stable security definer
set search_path = public
as $$
  with cohorts as (
    select
      lc.id,
      date_trunc('month', lc.created_at)::date as cohort_month
    from loyalty_customers lc
    where lc.created_at >= date_trunc('month', now()) - (p_months || ' months')::interval
  ),
  cohort_sizes as (
    select cohort_month, count(*) as sz
    from cohorts
    group by cohort_month
  ),
  activity as (
    select
      c.cohort_month,
      c.id as customer_id,
      m.month_start
    from cohorts c
    cross join lateral (
      select generate_series(0, p_months) as offset
    ) g
    cross join lateral (
      select date_trunc('month', c.cohort_month + (g.offset || ' months')::interval)::date as month_start
    ) m
    where m.month_start <= date_trunc('month', now())
  ),
  active as (
    select
      a.cohort_month,
      a.month_start,
      count(distinct a.customer_id) filter (where exists (
        select 1 from pos_orders o
        where o.loyalty_customer_id = a.customer_id
          and o.created_at >= a.month_start
          and o.created_at <  a.month_start + interval '1 month'
          and o.status = 'completed'
      ) or exists (
        select 1 from loyalty_stamps s
        where s.customer_id = a.customer_id
          and s.created_at >= a.month_start
          and s.created_at <  a.month_start + interval '1 month'
      )) as active_count
    from activity a
    group by a.cohort_month, a.month_start
  )
  select
    a.cohort_month,
    cs.sz as cohort_size,
    (extract(year  from age(a.month_start, a.cohort_month))::int * 12
   + extract(month from age(a.month_start, a.cohort_month))::int) as month_offset,
    a.active_count,
    case when cs.sz > 0 then 100.0 * a.active_count / cs.sz else 0 end as retention_pct
  from active a
  join cohort_sizes cs on cs.cohort_month = a.cohort_month;
$$;
grant execute on function public.cohort_retention(int) to authenticated;
