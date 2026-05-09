-- ============================================================
-- NOCHI PASS — Phase 6: consent-gated WhatsApp campaign segments
-- Three segment RPCs that ALL filter to whatsapp_opt_in = true and
-- require a phone. Built on Phase 5 consent infrastructure.
-- Re-runnable.
-- ============================================================

-- Birthday this week (today + 7 days, day-of-month only — no year)
create or replace function wa_segment_birthday_this_week()
returns table (
  customer_id    uuid,
  full_name      text,
  phone          text,
  top_drink      text,
  birthday_day   int,
  birthday_month int
)
language sql
security definer
set search_path = public
as $bday$
  with day_window as (
    select (current_date + n)::date as d
    from generate_series(0, 7) as n
  )
  select c.id,
         c.full_name,
         c.phone,
         coalesce(c.favorite_drink, c.favorite_drinks[1]) as top_drink,
         c.birthday_day,
         c.birthday_month
  from loyalty_customers c
  join day_window dw
    on extract(day from dw.d)::int   = c.birthday_day
   and extract(month from dw.d)::int = c.birthday_month
  where c.whatsapp_opt_in is true
    and coalesce(c.phone, '') <> ''
    and length(regexp_replace(c.phone, '[^0-9]', '', 'g')) >= 7
$bday$;

grant execute on function wa_segment_birthday_this_week() to authenticated;

-- Inactive regulars: at least 3 lifetime visits, no visit in p_days
create or replace function wa_segment_inactive(p_days int default 30)
returns table (
  customer_id  uuid,
  full_name    text,
  phone        text,
  top_drink    text,
  days_since   int,
  total_visits int
)
language sql
security definer
set search_path = public
as $inactive$
  select c.id,
         c.full_name,
         c.phone,
         coalesce(c.favorite_drink, c.favorite_drinks[1]) as top_drink,
         (extract(day from now() - c.last_visit_at))::int as days_since,
         c.total_visits
  from loyalty_customers c
  where c.whatsapp_opt_in is true
    and coalesce(c.phone, '') <> ''
    and length(regexp_replace(c.phone, '[^0-9]', '', 'g')) >= 7
    and c.total_visits >= 3
    and c.last_visit_at is not null
    and c.last_visit_at < now() - (p_days || ' days')::interval
  order by c.last_visit_at desc
$inactive$;

grant execute on function wa_segment_inactive(int) to authenticated;

-- Reward-ready: pending loyalty_rewards on file
create or replace function wa_segment_reward_ready()
returns table (
  customer_id    uuid,
  full_name      text,
  phone          text,
  top_drink      text,
  reward_count   int,
  oldest_pending timestamptz
)
language sql
security definer
set search_path = public
as $reward$
  select c.id,
         c.full_name,
         c.phone,
         coalesce(c.favorite_drink, c.favorite_drinks[1]) as top_drink,
         count(r.*)::int as reward_count,
         min(r.created_at) as oldest_pending
  from loyalty_customers c
  join loyalty_rewards r
    on r.customer_id = c.id
   and r.status = 'pending'
  where c.whatsapp_opt_in is true
    and coalesce(c.phone, '') <> ''
    and length(regexp_replace(c.phone, '[^0-9]', '', 'g')) >= 7
  group by c.id, c.full_name, c.phone, c.favorite_drink, c.favorite_drinks
  order by min(r.created_at) asc
$reward$;

grant execute on function wa_segment_reward_ready() to authenticated;

-- Ensure the marketing_campaigns row supports the new flow.
-- approved_by + approved_at + sent_count + failed_count make Phase 6's
-- staff-approval workflow auditable.
alter table marketing_campaigns
  add column if not exists approved_by   uuid references profiles(id) on delete set null,
  add column if not exists approved_at   timestamptz,
  add column if not exists send_started_at timestamptz,
  add column if not exists send_finished_at timestamptz,
  add column if not exists sent_count    int not null default 0,
  add column if not exists failed_count  int not null default 0;

notify pgrst, 'reload schema';
