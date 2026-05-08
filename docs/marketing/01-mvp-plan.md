# Marketing MVP — Implementation Plan

**Author:** Opus 4.7 · **Date:** 2026-05-08 · **Branch:** `claude/modest-goldberg-ad1a39`.
**Inputs:** [`docs/marketing/00-inspection.md`](docs/marketing/00-inspection.md) + brief priority order.

The brief locks priority: **Channel Analytics → Customer Intelligence**.

---

## 1. Architecture

### 1.1 Where it lives

A new top-level route `/marketing` with tabs: Channel Analytics · Customers · Cohorts · Channels (settings).

`/marketing` does **not** absorb the existing `/loyalty/*` routes. Those stay where they are — they're operational (stamp customer, redeem reward) and shouldn't move. `/marketing/customers/:id` instead **redirects to `/loyalty/customers/:id`** to keep one canonical Customer Profile View. Marketing only adds the segment + RFM lens to that page.

### 1.2 Permission model

Owner-only at the route level. Staff can already access `/loyalty` (operational) but not the marketing analytics surface. Same `OwnerRoute` pattern as `/finance`.

### 1.3 Code layout

```
apps/pos/src/modules/marketing/
  ├── MarketingDashboard.jsx        ← entry; tabs router
  ├── components/
  │   ├── PeriodSelector.jsx        ← reuse shared from finance
  │   ├── KPICard.jsx               ← reuse shared
  │   ├── ChannelSnapshotForm.jsx   ← weekly manual-entry form
  │   ├── SegmentBadge.jsx          ← VIP / Regular / At Risk / etc.
  │   └── CohortHeatmap.jsx         ← retention chart
  ├── tabs/
  │   ├── ChannelAnalyticsTab.jsx
  │   ├── CustomersTab.jsx          ← segment counts + jump to /loyalty/customers
  │   ├── CohortsTab.jsx
  │   └── SettingsTab.jsx           ← API connector status + manual-entry switch
  ├── lib/
  │   ├── marketing-supabase.js
  │   ├── rfm.js                    ← scoring helpers (read-only, server-side does the math)
  │   └── adapters/
  │       ├── google-business.js    ← skeleton; off by default
  │       ├── instagram.js          ← skeleton; off by default
  │       ├── tiktok.js             ← skeleton; off by default
  │       └── whatsapp.js           ← reads existing whatsapp_sends + Twilio totals
  └── pages/
      └── (none — everything routes through MarketingDashboard)
```

Adapters are **independent files**. Each exports a uniform interface (`fetchSnapshot()`, `isConfigured()`). The dashboard renders one section per adapter; if an adapter `isConfigured() === false`, the section shows a "connect" stub. This honors the brief's "if a channel API breaks or rate-limits, the rest of the dashboard still works."

---

## 2. Schema migration

One migration: `supabase/migrations/20260508020000_marketing_mvp.sql`.

### 2.1 New tables

```sql
-- ── Per-account daily snapshots (followers, reach, engagement) ────────
-- Per-post snapshots already live in post_performance.
create table if not exists marketing_channel_snapshots (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in (
    'instagram','tiktok','facebook','google_business','whatsapp'
  )),
  account_label text,                 -- e.g. '@noch.cafe'
  snapshot_date date not null,
  followers int,
  reach int,
  profile_visits int,
  link_clicks int,
  impressions int,
  engagement_rate numeric(6,2),
  -- Google Business specific
  review_count int,
  avg_rating numeric(3,2),
  direction_requests int,
  phone_calls int,
  -- WhatsApp specific
  messages_sent int,
  messages_delivered int,
  messages_read int,
  -- bookkeeping
  source text default 'manual'        -- 'manual' | 'api'
    check (source in ('manual','api')),
  raw jsonb,                           -- full API payload (when source='api')
  created_at timestamptz default now(),
  created_by uuid references profiles(id),
  unique (channel, account_label, snapshot_date)
);
create index if not exists marketing_channel_snapshots_chan_idx
  on marketing_channel_snapshots (channel, snapshot_date desc);

alter table marketing_channel_snapshots enable row level security;
create policy "marketing_channel_snapshots_owner_only"
  on marketing_channel_snapshots
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ── Customer marketing flags ────────────────────────────────────────
alter table loyalty_customers
  add column if not exists marketing_opt_in boolean default true,
  add column if not exists last_marketing_contact_at timestamptz,
  add column if not exists phone_normalised text;

-- One-time normaliser. Strips whitespace, dashes, normalises +218 prefix.
-- Rules:
--   - "+218 91 234 5678" → "+218912345678"
--   - "0912345678"        → "+218912345678"
--   - "912345678"         → "+218912345678"
update loyalty_customers
   set phone_normalised = (
     case
       when phone ~ '^\+218'         then regexp_replace(phone, '\s|-', '', 'g')
       when phone ~ '^0?9'           then '+218' || regexp_replace(regexp_replace(phone, '\s|-', '', 'g'), '^0', '')
       else regexp_replace(phone, '\s|-', '', 'g')
     end
   )
 where phone_normalised is null;

-- Detect duplicates created by inconsistent formatting (report only; user merges manually).
create or replace view loyalty_customer_duplicates as
select phone_normalised, count(*) as dup_count, array_agg(id order by created_at) as customer_ids
from loyalty_customers
where phone_normalised is not null
group by phone_normalised
having count(*) > 1;
grant select on loyalty_customer_duplicates to authenticated;

-- ── Customer segments (materialised; refreshed nightly) ─────────────
create table if not exists customer_segments (
  customer_id uuid primary key references loyalty_customers(id) on delete cascade,
  segment text not null check (segment in (
    'vip','regular','occasional','at_risk','churned','new'
  )),
  recency_score int check (recency_score between 1 and 5),
  frequency_score int check (frequency_score between 1 and 5),
  monetary_score int check (monetary_score between 1 and 5),
  rfm_composite int,                  -- R*100 + F*10 + M
  total_visits int default 0,
  total_spend_lyd numeric(12,2) default 0,
  last_visit_at timestamptz,
  computed_at timestamptz default now()
);
create index if not exists customer_segments_seg_idx on customer_segments (segment);
alter table customer_segments enable row level security;
create policy "customer_segments_authenticated"
  on customer_segments
  for select to authenticated using (true);
-- writes only via the RPC below.
```

### 2.2 RFM segmentation RPC

```sql
create or replace function public.refresh_customer_segments()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  -- Compute per-customer R/F/M scores from pos_orders (truth) + loyalty_stamps fallback.
  with base as (
    select
      lc.id as customer_id,
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
    group by lc.id
  ),
  scored as (
    select
      customer_id,
      last_seen,
      visits,
      spend,
      -- Recency: days since last seen, lower = better
      case
        when last_seen is null then 1
        when last_seen >= v_now - interval '7 days' then 5
        when last_seen >= v_now - interval '14 days' then 4
        when last_seen >= v_now - interval '30 days' then 3
        when last_seen >= v_now - interval '60 days' then 2
        else 1
      end as r,
      -- Frequency: visits in window
      case
        when visits >= 12 then 5
        when visits >=  6 then 4
        when visits >=  3 then 3
        when visits >=  1 then 2
        else 1
      end as f,
      -- Monetary: ntile on positive spenders, fallback 1 for non-spenders
      coalesce(
        case when spend > 0
             then ntile(5) over (order by spend)
             else 1 end,
        1
      ) as m
    from base
  ),
  segmented as (
    select
      customer_id, last_seen, visits, spend, r, f, m,
      r*100 + f*10 + m as composite,
      case
        -- New: registered in last 14 days, regardless of spend
        when last_seen is null then 'churned'
        when last_seen >= v_now - interval '14 days' and visits = 1 then 'new'
        -- VIP: high recency + top spender
        when r >= 4 and m >= 5 then 'vip'
        -- Regular: 3+ visits and recent
        when r >= 4 and f >= 3 then 'regular'
        -- At Risk: was regular, fallen quiet
        when r in (2,3) and f >= 3 then 'at_risk'
        -- Churned: hasn't been in for 30+ days
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

-- Schedule nightly. (cron extension already in repo per loyalty migrations.)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-customer-segments') then
    perform cron.unschedule('refresh-customer-segments');
  end if;
end $$;
select cron.schedule(
  'refresh-customer-segments',
  '15 4 * * *',  -- 04:15 UTC = 07:15 Africa/Tripoli, after the Nochi state job
  $$ select public.refresh_customer_segments(); $$
);
```

### 2.3 Cohort retention RPC

```sql
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
  activity as (
    select
      c.cohort_month,
      c.id as customer_id,
      m.month_start
    from cohorts c
    cross join generate_series(
      0, p_months
    ) as g(offset)
    cross join lateral (
      select date_trunc('month', c.cohort_month + (g.offset || ' months')::interval)::date as month_start
    ) m
    where m.month_start <= date_trunc('month', now())
  ),
  active as (
    select
      a.cohort_month,
      a.customer_id,
      a.month_start,
      exists (
        select 1
        from pos_orders o
        where o.loyalty_customer_id = a.customer_id
          and o.created_at >= a.month_start
          and o.created_at <  a.month_start + interval '1 month'
          and o.status = 'completed'
      ) or exists (
        select 1
        from loyalty_stamps s
        where s.customer_id = a.customer_id
          and s.created_at >= a.month_start
          and s.created_at <  a.month_start + interval '1 month'
      ) as is_active
    from activity a
  )
  select
    cohort_month,
    (select count(*) from cohorts c2 where c2.cohort_month = a.cohort_month) as cohort_size,
    extract(year from age(month_start, cohort_month))::int * 12
      + extract(month from age(month_start, cohort_month))::int as month_offset,
    count(*) filter (where is_active) as active_customers,
    100.0 * count(*) filter (where is_active)
       / nullif((select count(*) from cohorts c3 where c3.cohort_month = a.cohort_month), 0)
       as retention_pct
  from active a
  group by cohort_month, month_start;
$$;
grant execute on function public.cohort_retention(int) to authenticated;
```

---

## 3. Screens, in order they ship

### 3.1 Channel Analytics Tab (priority 1, headline)

- **Period selector** + a per-channel section. Each section shows: current period vs prior period, with trend line, and a flag if any metric moved >20% week-over-week (per brief).
- **Manual-entry mode is the default.** Each channel section has a "Log this week's numbers" button → opens `ChannelSnapshotForm.jsx` modal with the relevant fields. Saves to `marketing_channel_snapshots` with `source='manual'`.
- **API mode** activates when `isConfigured()` returns true for an adapter. Disabled/unconfigured adapters show a "Connect" stub linking to `/marketing#settings`.
- **Today's MVP rollout:**
  - Instagram: manual only (Phase 2.5: Graph API onboarding).
  - TikTok: manual only.
  - Facebook: manual only (or piggyback on IG Graph for the Page).
  - Google Business: API skeleton in place; activate when location is OAuth-linked.
  - WhatsApp: 🟢 reads `whatsapp_sends` table directly + computes delivery/read rates from Twilio status callbacks (NEEDS_MANUAL_VERIFY whether Twilio webhook updates statuses today).

### 3.2 Customers Tab (priority 2)

- **Segment counts** as a row of 6 KPI cards: VIP / Regular / Occasional / At Risk / Churned / New. Each card clickable → filters the list below.
- **Customer list** with phone, segment, last visit, total visits, total spend. Click a row → navigate to `/loyalty/customers/:id` (existing page; the segment + RFM scores get added there).
- **At-risk and Churned tabs are the action queues** — these are the customers worth a WhatsApp nudge. Phase 4 campaign engine reads these segments.
- **"Refresh now" button** runs `refresh_customer_segments()` on demand; otherwise it's nightly.
- **"Possible duplicates"** banner if the `loyalty_customer_duplicates` view returns rows. One-click "review" opens a side panel with side-by-side rows; owner picks which to keep + clicks merge (Phase 2.5; for v1, we surface the count and link to a manual cleanup).

### 3.3 Cohort Retention Tab

- **Heatmap**: rows = cohort month, columns = months 0..N. Cell value = retention %. Colour scale green→red.
- **6-month default**, dropdown to extend to 12.
- **Brief says** this is the single best leading indicator of brand health. The chart should be readable in 5 seconds — that means clear axis labels and one summary stat above ("Average month-1 retention: 28%").

### 3.4 Settings Tab

- **API connectors** — for each channel: status (configured / not), button to connect (OAuth or paste-API-key flow). Manual-entry switch toggles whether we accept manual rows even when API is on.
- **Marketing opt-in defaults** for the customer flow.
- **Phone normalisation rules** (read-only display of the rules in 2.2; the rule list itself is hard-coded for v1).

### 3.5 Customer Profile Extension (on `/loyalty/customers/:id`)

- A new section **"Marketing intelligence"** added to the existing page (not rebuilt):
  - Segment badge (VIP, Regular, etc.)
  - RFM scores (5-5-3 visual)
  - Last 6 months visit + spend mini chart
  - Recommended next action ("send WhatsApp nudge", "invite to launch event", etc.) — phase 4 hook; v1 just shows the segment-based recommendation as static text.

---

## 4. What v1 explicitly does NOT include

(per brief)

- **Campaign engine** → Phase 4
- **Content calendar** → Phase 4 (links to existing `/content-studio`)
- **Reputation inbox** → Phase 4
- **Email automation, paid ads management, influencer CRM, A/B infrastructure** → out forever in this scope

---

## 5. Sequencing

**Day 1:**
- Migration `20260508020000_marketing_mvp.sql`
- Phone-normalise existing `loyalty_customers` (one-shot in the migration)
- `refresh_customer_segments()` first run

**Day 2:**
- `MarketingDashboard.jsx` shell + Settings tab (so I can toggle adapters)
- Channel Analytics Tab with manual entry only (IG / FB / TikTok / GBP all manual)

**Day 3:**
- Customers Tab + Customer Profile extension on existing `/loyalty/customers/:id`
- Cohorts Tab

**Day 4 (if budget):**
- Google Business Profile API connector (priority 1 of the API onboardings — lowest friction, highest signal)
- Polish, mobile pass, write `docs/marketing/02-mvp-shipped.md`.

**API onboarding deferred (separate stream of work):**
- Meta IG Graph (Phase 2.5; ~2–4 hours non-coding setup with the user)
- TikTok Business API (Phase 2.5)

---

## 6. Open assumptions (called out so you can correct)

1. **Phone normalisation rules** match Libyan numbers (+218, leading 0 stripped, leading 9 prefixed). NEEDS_MANUAL_VERIFY for any number that doesn't fit (international staff, suppliers stored in same table?).
2. **Cron scheduling at 04:15 UTC** runs alongside existing Nochi state job at 04:00. Confirm timezone tolerable.
3. **Customer segment thresholds** (VIP = top quintile spend + recent, Regular = 3+ visits + recent, etc.) match the brief but use a 180-day window. Brief says 14d/30d for some bands — I've kept those, with a 180d max-history cap to avoid pulling all historical orders on every refresh.
4. **`/marketing` route is owner-only.** Staff don't see this surface. Acceptable since it's read-only insight, not operational.
5. **Existing `loyalty_feedback`, `loyalty_challenges`, etc.** are out of scope for v1 marketing. They're displayed where they live today (`/loyalty`).
6. **WhatsApp adapter** reads `whatsapp_sends` table for outbound counts. Inbound (customer-initiated) flow doesn't exist; if customers DM the WhatsApp number, those messages aren't captured. Marketing dashboard cannot show inbound message volume in v1.
7. **Manual-entry weekly form** is the **default path**, not a fallback. The brief allows API connectors to be Phase 2.5; manual entry is Day-2 ship.

---

## 7. Verification plan

1. After migration: `select count(*) from customer_segments` → expect non-zero (nightly cron + immediate first run).
2. UI: visit `/marketing` → 6 segment cards render with non-zero counts (assuming any orders/stamps exist).
3. UI: log a fake IG snapshot via the form → see it in Channel Analytics with prior-period comparison.
4. UI: open `/loyalty/customers/:id` for a known repeat customer → see segment badge + RFM scores.
5. UI: Cohort tab renders the heatmap with at least one cohort row.
6. Build green; lint clean.

---

## 8. Cross-module integration

- **Finance "Marketing spend"** — Phase 4 campaign costs will land in `marketing_campaigns.cost_lyd`. Until then, marketing spend appears as `expense_entries.category='marketing'` rows (already supported in Finance MVP).
- **Future "VIP-only menu" / "VIP-priority WhatsApp queue"** — both consume `customer_segments.segment` directly. No additional API surface needed.
- **Storefront menu** — already captures `customer_phone` on guest orders. Phase 2.5 should auto-upsert into `loyalty_customers` (via a one-line trigger or RPC change in `submit_guest_order`) so the marketing funnel stays whole.

---

## 9. Risk list

| Risk | Mitigation |
|---|---|
| Many orders have null `loyalty_customer_id` → RFM is unreliable | Surface "% of orders linked to loyalty" as a top-of-Customers-tab health metric; if <30%, big banner says "your numbers are biased low; encourage QR scans." |
| Phone normalisation mis-merges two real customers | First run produces a `loyalty_customer_duplicates` report; owner reviews before any merge. |
| nightly cron fails silently | Audit log + a top-of-tab "last refreshed N hours ago" stamp. |
| API onboarding takes longer than planned | Manual entry is the default; API connectors don't gate the dashboard. |
| Adding `phone_normalised` column without an index is slow on large customer counts | Add `unique index on phone_normalised` after the one-time backfill — but only after verifying no NULL/dup conflicts. |

**Ready to start Day-1 build of both modules on your go.**
