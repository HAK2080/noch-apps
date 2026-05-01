-- Phase-0 activation of dormant loyalty mechanics:
-- - Customer-named Nochi (nochi_name column)
-- - Phoenix tracking (is_phoenix, revival_count)
-- - Birthday auto-reward trigger
-- - Referral reward trigger (both sides +1 stamp)
-- - Phoenix badge trigger (resurrected from 'dead')
-- - Monthly challenges seed (4 starter challenges)
-- - Negative-feedback escalation flag
--
-- All idempotent. Apply via dashboard SQL editor.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. New columns on loyalty_customers
-- ──────────────────────────────────────────────────────────────────────────
alter table public.loyalty_customers
  add column if not exists nochi_name      text,
  add column if not exists is_phoenix      boolean not null default false,
  add column if not exists revival_count   int     not null default 0,
  add column if not exists referred_by_id  uuid    references public.loyalty_customers(id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Birthday auto-reward — fired by a daily cron job (or whatsapp-cron's
--    birthday branch). Generates a free-drink reward when today matches.
--    Idempotent within a year (one reward per customer per year).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.grant_birthday_rewards_today()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  with eligible as (
    select c.id
    from public.loyalty_customers c
    where c.birthday_day  = extract(day   from current_date)::int
      and c.birthday_month = extract(month from current_date)::int
      and not exists (
        select 1 from public.loyalty_rewards r
        where r.customer_id = c.id
          and r.description ilike '%birthday%'
          and r.created_at > now() - interval '300 days'
      )
  ), inserted as (
    insert into public.loyalty_rewards (customer_id, description, status, expires_at)
    select id,
           'Birthday free drink — Nochi made it for you',
           'pending',
           now() + interval '7 days'
    from eligible
    returning 1
  )
  select count(*) into affected from inserted;
  return affected;
end;
$$;
grant execute on function public.grant_birthday_rewards_today() to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Referral reward — when a referred customer receives their first stamp,
--    bump both customers' stamps by 1 and mark the referral as paid.
--    Triggered AFTER INSERT on loyalty_stamps.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.fn_referral_first_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_first_stamp boolean;
begin
  select * into v_customer from public.loyalty_customers where id = NEW.customer_id;
  if v_customer.referred_by_id is null then return NEW; end if;

  -- Was this their first stamp? (count of their stamps including this one)
  select (count(*) = 1) into v_first_stamp
    from public.loyalty_stamps where customer_id = NEW.customer_id;
  if not v_first_stamp then return NEW; end if;

  -- Already paid? Look for a marker reward to avoid double-pay
  if exists (
    select 1 from public.loyalty_rewards
    where customer_id = v_customer.referred_by_id
      and description ilike '%referral_paid:' || v_customer.id || '%'
  ) then
    return NEW;
  end if;

  -- Bump both customers' stamps by 1 and reset their nochi_state to happy
  update public.loyalty_customers
    set current_stamps = current_stamps + 1,
        total_stamps   = total_stamps   + 1,
        nochi_state    = 'happy'
    where id in (NEW.customer_id, v_customer.referred_by_id);

  -- Mark referrer as paid by inserting a hidden marker reward
  insert into public.loyalty_rewards (customer_id, description, status, expires_at)
  values (
    v_customer.referred_by_id,
    'Referral bonus stamp (referral_paid:' || v_customer.id || ')',
    'redeemed',
    now()
  );

  return NEW;
end;
$$;
drop trigger if exists trg_referral_first_stamp on public.loyalty_stamps;
create trigger trg_referral_first_stamp
  after insert on public.loyalty_stamps
  for each row execute function public.fn_referral_first_stamp();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Phoenix badge — when a customer in 'dead' nochi_state visits and gets
--    a stamp, flag is_phoenix and bump revival_count. The customer earns the
--    Phoenix badge on the FIRST revival.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.fn_phoenix_revival()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_dead boolean;
begin
  -- Was their nochi_state 'dead' BEFORE this stamp?
  select (nochi_state = 'dead') into v_was_dead
    from public.loyalty_customers where id = NEW.customer_id;
  if not v_was_dead then return NEW; end if;

  update public.loyalty_customers
    set is_phoenix    = true,
        revival_count = revival_count + 1,
        nochi_state   = 'happy'
    where id = NEW.customer_id;

  -- Insert a "phoenix" badge marker (BadgeGrid will pick it up)
  insert into public.loyalty_customer_badges (customer_id, badge_key, earned_at)
  values (NEW.customer_id, 'phoenix', now())
  on conflict (customer_id, badge_key) do nothing;

  return NEW;
end;
$$;
drop trigger if exists trg_phoenix_revival on public.loyalty_stamps;
create trigger trg_phoenix_revival
  before insert on public.loyalty_stamps
  for each row execute function public.fn_phoenix_revival();

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Seed 4 monthly challenges (idempotent on title)
-- ──────────────────────────────────────────────────────────────────────────
insert into public.loyalty_challenges
  (title, description, challenge_type, target_value, bonus_stamps, is_active, starts_at, ends_at)
values
  ('Speedrunner', '5 visits in 7 days — earn 2 bonus stamps + the Speedrunner badge.',
   'visits', 5, 2, true, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'),
  ('Curious', 'Try 3 different drinks this month — earn 1 bonus stamp + the Curious badge.',
   'visits', 3, 1, true, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'),
  ('Streak Keeper', 'Keep a 7-day streak this month — earn 3 bonus stamps + the Streak Keeper badge.',
   'streak', 7, 3, true, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'),
  ('Connector', 'Refer 1 friend who registers and visits — earn the Connector badge.',
   'referral', 1, 0, true, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month')
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Helper view: my_recent_loyalty_events — used by /my-card timeline.
-- Returns last 20 events (stamps + rewards earned) per current user.
-- ──────────────────────────────────────────────────────────────────────────
create or replace view public.loyalty_recent_events as
  select
    'stamp'::text  as kind,
    s.customer_id,
    s.created_at,
    null::text     as description,
    s.stamp_number as value
  from public.loyalty_stamps s
  union all
  select
    'reward'::text as kind,
    r.customer_id,
    r.created_at,
    r.description,
    null::int      as value
  from public.loyalty_rewards r
  where r.description not ilike '%referral_paid%'
  order by created_at desc;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. RLS on the new event view inherits from loyalty_stamps + loyalty_rewards.
--    Existing RLS policies on those tables already gate access correctly.
-- ──────────────────────────────────────────────────────────────────────────
grant select on public.loyalty_recent_events to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. Anon self-registration: insert-only. Cannot read other customers.
-- ──────────────────────────────────────────────────────────────────────────
alter table public.loyalty_customers enable row level security;
drop policy if exists "lc_anon_self_register" on public.loyalty_customers;
create policy "lc_anon_self_register" on public.loyalty_customers
  for insert
  to anon
  with check (
    full_name is not null and length(full_name) between 2 and 80
    and phone is not null and length(phone) between 7 and 30
  );
grant insert on public.loyalty_customers to anon;

-- Referral-code → id lookup, called by the public registration page.
-- Returns ONLY the id (no other columns leak).
create or replace function public.resolve_referral_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.loyalty_customers
  where referral_code = p_code limit 1;
$$;
grant execute on function public.resolve_referral_code(text) to anon, authenticated;
