-- LOYALTY_PUBLIC_API.sql
-- Customer-facing loyalty endpoints. Idempotent — safe to re-run.
-- Run in Supabase SQL Editor.
--
-- DESIGN: simplified — no OTP. Phone-based lookup is sufficient for a coffee
-- punch card. The actual REDEMPTION still requires the 5-min QR token at the
-- counter, so a peeping phone-knower can't spend someone else's free drink.
--
-- Exposes 4 SECURITY DEFINER functions to anon/authenticated:
--   1. get_my_loyalty_card(p_phone)             — read card by phone
--   2. signup_loyalty_customer(...)              — create card + queue welcome SMS
--   3. request_my_qr_token(p_phone)              — fresh 5-min QR for the barista
--   4. redeem_my_reward(p_phone, p_reward_id)    — initiate reward redemption (returns QR)

-- ── Phone normalization (digits only) ────────────────────────────────
create or replace function public.loyalty_normalize_phone(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

-- ── 1. get_my_loyalty_card ───────────────────────────────────────────
create or replace function public.get_my_loyalty_card(p_phone text)
returns jsonb
security definer
set search_path = public
language plpgsql
as $$
declare
  v_customer  loyalty_customers%rowtype;
  v_settings  loyalty_settings%rowtype;
  v_pending   jsonb;
begin
  if p_phone is null or length(loyalty_normalize_phone(p_phone)) < 6 then
    raise exception 'PHONE_INVALID' using errcode = '22023';
  end if;

  select * into v_customer from loyalty_customers
   where loyalty_normalize_phone(phone) = loyalty_normalize_phone(p_phone)
   limit 1;

  if not found then
    return jsonb_build_object('customer', null);
  end if;

  select * into v_settings from loyalty_settings limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'description', description,
           'expires_at', expires_at, 'status', status
         )), '[]'::jsonb)
    into v_pending
    from loyalty_rewards
   where customer_id = v_customer.id
     and status = 'pending'
     and (expires_at is null or expires_at > now());

  return jsonb_build_object(
    'customer',        to_jsonb(v_customer),
    'pending_rewards', v_pending,
    'settings',        coalesce(to_jsonb(v_settings), '{}'::jsonb)
  );
end;
$$;

grant execute on function public.get_my_loyalty_card(text) to anon, authenticated;

-- ── 2. signup_loyalty_customer (also queues welcome SMS) ─────────────
create or replace function public.signup_loyalty_customer(
  p_phone     text,
  p_full_name text,
  p_birthday  date default null
)
returns jsonb
security definer
set search_path = public
language plpgsql
as $$
declare
  v_existing  loyalty_customers%rowtype;
  v_new       loyalty_customers%rowtype;
  v_first     text;
  v_msg       text;
begin
  if p_phone is null or length(loyalty_normalize_phone(p_phone)) < 6 then
    raise exception 'PHONE_INVALID' using errcode = '22023';
  end if;
  if p_full_name is null or length(trim(p_full_name)) < 1 then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;

  -- Idempotent: return existing if phone already on file
  select * into v_existing from loyalty_customers
   where loyalty_normalize_phone(phone) = loyalty_normalize_phone(p_phone)
   limit 1;
  if found then
    return to_jsonb(v_existing);
  end if;

  insert into loyalty_customers (phone, full_name, birthday)
  values (p_phone, trim(p_full_name), p_birthday)
  returning * into v_new;

  return to_jsonb(v_new);
end;
$$;

grant execute on function public.signup_loyalty_customer(text, text, date) to anon, authenticated;

-- ── 2b. loyalty_send_welcome ─────────────────────────────────────────
-- Called by the storefront AFTER the customer has tapped "Enable WhatsApp".
-- Queues a 60-second-delayed welcome via WhatsApp so the customer has time
-- to send the sandbox join phrase before the dispatcher attempts delivery.
create or replace function public.loyalty_send_welcome(p_phone text)
returns boolean
security definer
set search_path = public
language plpgsql
as $$
declare
  v_c     loyalty_customers%rowtype;
  v_first text;
  v_msg   text;
  v_id    uuid;
begin
  if p_phone is null then
    raise exception 'PHONE_INVALID' using errcode = '22023';
  end if;

  select * into v_c from loyalty_customers
   where loyalty_normalize_phone(phone) = loyalty_normalize_phone(p_phone)
   limit 1;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = '42704';
  end if;

  v_first := coalesce(nullif(split_part(v_c.full_name, ' ', 1), ''), 'friend');
  v_msg := E'Hey ' || v_first || E'! 🐇 Welcome to Nochi loyalty. Your punch card is ready — open it any time: https://noch.cloud/#loyalty'
        || case when v_c.birthday is not null
                then E'\n\nWe spotted your birthday — Nochi will send a free drink your way that day. 🎂'
                else ''
           end;

  begin
    v_id := public.loyalty_queue_message(
      v_c.id, 'whatsapp', v_c.phone, v_msg, 'custom',
      jsonb_build_object('subkind', 'welcome'),
      interval '24 hours'
    );
  exception when undefined_function then
    return false;  -- LOYALTY_REMINDERS.sql not applied yet
  end;

  -- delay 60s so the join phrase has time to register
  if v_id is not null then
    update loyalty_messages_outbox
       set scheduled_at = now() + interval '60 seconds'
     where id = v_id;
  end if;

  return v_id is not null;
end;
$$;

grant execute on function public.loyalty_send_welcome(text) to anon, authenticated;

-- ── 3. request_my_qr_token ───────────────────────────────────────────
create or replace function public.request_my_qr_token(p_phone text)
returns jsonb
security definer
set search_path = public
language plpgsql
as $$
declare
  v_customer_id uuid;
  v_token       text;
  v_expires_at  timestamptz;
begin
  if p_phone is null then
    raise exception 'PHONE_INVALID' using errcode = '22023';
  end if;

  select id into v_customer_id from loyalty_customers
   where loyalty_normalize_phone(phone) = loyalty_normalize_phone(p_phone)
   limit 1;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = '42704';
  end if;

  v_token      := 'NOCHI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  v_expires_at := now() + interval '5 minutes';

  insert into loyalty_qr_tokens (token, customer_id, expires_at)
  values (v_token, v_customer_id, v_expires_at);

  return jsonb_build_object('token', v_token, 'expires_at', v_expires_at);
end;
$$;

grant execute on function public.request_my_qr_token(text) to anon, authenticated;

-- ── 4. redeem_my_reward ──────────────────────────────────────────────
-- Add drink_choice column on the QR token (idempotent)
alter table public.loyalty_qr_tokens add column if not exists drink_choice text;

-- Drop old signature so the new (text, uuid, text) signature can replace cleanly
drop function if exists public.redeem_my_reward(text, uuid);

create or replace function public.redeem_my_reward(
  p_phone     text,
  p_reward_id uuid,
  p_drink     text default null
)
returns jsonb
security definer
set search_path = public
language plpgsql
as $$
declare
  v_customer_id uuid;
  v_reward      loyalty_rewards%rowtype;
  v_token       text;
  v_expires_at  timestamptz;
begin
  if p_phone is null then
    raise exception 'PHONE_INVALID' using errcode = '22023';
  end if;

  select id into v_customer_id from loyalty_customers
   where loyalty_normalize_phone(phone) = loyalty_normalize_phone(p_phone)
   limit 1;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = '42704';
  end if;

  select * into v_reward from loyalty_rewards
   where id = p_reward_id
     and customer_id = v_customer_id
     and status = 'pending'
     and (expires_at is null or expires_at > now())
   limit 1;
  if not found then
    raise exception 'REWARD_NOT_REDEEMABLE' using errcode = '42501';
  end if;

  v_token      := 'NOCHI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  v_expires_at := now() + interval '5 minutes';

  insert into loyalty_qr_tokens (token, customer_id, expires_at, drink_choice)
  values (v_token, v_customer_id, v_expires_at, nullif(trim(coalesce(p_drink, '')), ''));

  return jsonb_build_object(
    'token',        v_token,
    'reward_id',    v_reward.id,
    'description',  v_reward.description,
    'drink_choice', nullif(trim(coalesce(p_drink, '')), ''),
    'expires_at',   v_expires_at
  );
end;
$$;

grant execute on function public.redeem_my_reward(text, uuid, text) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────
-- select proname from pg_proc
--  where proname in ('get_my_loyalty_card','signup_loyalty_customer','request_my_qr_token','redeem_my_reward');
