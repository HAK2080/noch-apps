-- WhatsApp marketing cron requires 5 recipient-resolver RPCs.
-- These were referenced by supabase/functions/whatsapp-cron/index.ts but
-- never defined, so the cron has been crashing on first call. This migration
-- creates them with sensible defaults; tune thresholds in loyalty_settings later.
--
-- Common return shape (consumed by whatsapp-cron's `Recipient` type):
--   customer_id uuid, phone text, full_name text, plus context fields used
--   by message templates: top_drink, days_since, streak.
--
-- All five functions filter to customers who:
--   - have a phone (NOT NULL, length >= 7)
--   - are NOT opted out (loyalty_customers.whatsapp_opt_out IS NOT TRUE
--     — column may not exist; we coalesce defensively)
--   - have not received the same trigger in the dedupe window (varies per
--     trigger; 24h–14d). Dedupe is read from the `whatsapp_sends` table
--     populated by `record_whatsapp_send`, also seen in whatsapp-cron.

-- ──────────────────────────────────────────────────────────────────────────
-- whatsapp_sends: log table for every send attempt. Used for dedupe and
-- analytics. record_whatsapp_send RPC is the writer (called by whatsapp-cron).
-- Both are missing from prior migrations; adding here.
-- ──────────────────────────────────────────────────────────────────────────
-- If the table was partly created by an earlier failed run with a 'trigger'
-- column (a borderline-reserved word), rename it before re-creating.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_sends'
      and column_name = 'trigger'
  ) then
    execute 'alter table public.whatsapp_sends rename column "trigger" to trigger_name';
  end if;
end $$;

create table if not exists public.whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id uuid references public.loyalty_customers(id) on delete set null,
  phone text not null,
  template text not null,
  trigger_name text not null,
  status text not null check (status in ('sent','failed')),
  error text,
  payload_key text
);

create index if not exists whatsapp_sends_customer_trigger_idx
  on public.whatsapp_sends (customer_id, trigger_name, created_at desc);
create index if not exists whatsapp_sends_phone_idx
  on public.whatsapp_sends (phone, created_at desc);

alter table public.whatsapp_sends enable row level security;
drop policy if exists "ws_owner_all" on public.whatsapp_sends;
create policy "ws_owner_all" on public.whatsapp_sends
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
-- service_role bypasses RLS, so cron writes work without policy

drop function if exists public.record_whatsapp_send(uuid,text,text,text,text,text,text);
create function public.record_whatsapp_send(
  p_customer_id uuid,
  p_phone text,
  p_template text,
  p_trigger text,
  p_status text,
  p_error text default null,
  p_payload_key text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.whatsapp_sends (customer_id, phone, template, trigger_name, status, error, payload_key)
  values (p_customer_id, p_phone, p_template, p_trigger, p_status, p_error, p_payload_key);
$$;
grant execute on function public.record_whatsapp_send(uuid,text,text,text,text,text,text) to authenticated, service_role;

-- Helper: did we send this trigger to this customer recently?
drop function if exists public._wa_recently_sent(uuid,text,interval);
create function public._wa_recently_sent(
  p_customer_id uuid,
  p_trigger text,
  p_window interval
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.whatsapp_sends
    where customer_id = p_customer_id
      and trigger_name = p_trigger
      and status = 'sent'
      and created_at > now() - p_window
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. ANNIVERSARY — fires on each 365-day mark from registered_at.
--    Dedupe: 14 days (don't double-send if cron runs twice near midnight).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_anniversary_recipients()
returns table (
  customer_id uuid,
  phone text,
  full_name text,
  top_drink text,
  years int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id           as customer_id,
    c.phone        as phone,
    c.full_name    as full_name,
    null::text     as top_drink,        -- drink preference not tracked yet
    floor(extract(epoch from (now() - c.created_at)) / 86400 / 365)::int as years
  from public.loyalty_customers c
  where c.phone is not null
    and length(c.phone) >= 7
    and c.created_at is not null
    -- today is on/around an anniversary boundary (within ±0.5 days of a 365-day multiple)
    and abs(
          mod(
            extract(epoch from (now() - c.created_at))::numeric,
            (365 * 86400)::numeric
          ) - 0
        ) <= 43200   -- ±12 hours
    and not public._wa_recently_sent(c.id, 'anniversary', interval '14 days');
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. BIRTHDAY — fires when today's day+month matches the customer's.
--    Dedupe: 11 months (avoid same-year retrigger if cron is buggy).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_birthday_recipients()
returns table (
  customer_id uuid,
  phone text,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id        as customer_id,
    c.phone     as phone,
    c.full_name as full_name
  from public.loyalty_customers c
  where c.phone is not null
    and length(c.phone) >= 7
    and c.birthday_day  = extract(day   from current_date)::int
    and c.birthday_month = extract(month from current_date)::int
    and not public._wa_recently_sent(c.id, 'birthday', interval '300 days');
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. LAPSED — fires on customers with last_visit_at older than p_days.
--    Cron passes p_days = 30. Dedupe: 30 days (one nudge per lapse cycle).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_lapsed_recipients(p_days int default 30)
returns table (
  customer_id uuid,
  phone text,
  full_name text,
  days_since int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id        as customer_id,
    c.phone     as phone,
    c.full_name as full_name,
    extract(day from (now() - c.last_visit_at))::int as days_since
  from public.loyalty_customers c
  where c.phone is not null
    and length(c.phone) >= 7
    and c.last_visit_at is not null
    and c.last_visit_at < now() - (p_days || ' days')::interval
    and c.last_visit_at > now() - interval '180 days'  -- skip ancient ghosts
    and not public._wa_recently_sent(c.id, 'lapsed', interval '30 days');
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. STREAK SAVE — customers with an active streak >= 3 who haven't visited
--    in 24–48 h (about to break). Dedupe: 7 days.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_streak_save_recipients()
returns table (
  customer_id uuid,
  phone text,
  full_name text,
  streak int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id        as customer_id,
    c.phone     as phone,
    c.full_name as full_name,
    coalesce(c.current_streak, 0) as streak
  from public.loyalty_customers c
  where c.phone is not null
    and length(c.phone) >= 7
    and coalesce(c.current_streak, 0) >= 3
    and c.last_visit_at is not null
    and c.last_visit_at < now() - interval '24 hours'
    and c.last_visit_at > now() - interval '48 hours'
    and not public._wa_recently_sent(c.id, 'streak', interval '7 days');
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. WEATHER ICED — would target customers who like iced drinks on hot days.
--    The schema doesn't track drink preference or weather yet, so this is
--    a stub that returns no rows. Cron will skip it cleanly. Implement once
--    drink-level data is captured (loyalty_stamps.drink_id) and a weather
--    feed is integrated.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_weather_iced_recipients()
returns table (
  customer_id uuid,
  phone text,
  full_name text,
  top_drink text
)
language sql
stable
security definer
set search_path = public
as $$
  select null::uuid, null::text, null::text, null::text where false;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- Permissions: cron calls these via the service_role key (which bypasses
-- RLS and grants), but we also grant authenticated/anon execute so they're
-- callable from the dashboard for debugging.
-- ──────────────────────────────────────────────────────────────────────────
grant execute on function public.whatsapp_anniversary_recipients()    to authenticated, service_role;
grant execute on function public.whatsapp_birthday_recipients()       to authenticated, service_role;
grant execute on function public.whatsapp_lapsed_recipients(int)      to authenticated, service_role;
grant execute on function public.whatsapp_streak_save_recipients()    to authenticated, service_role;
grant execute on function public.whatsapp_weather_iced_recipients()   to authenticated, service_role;
