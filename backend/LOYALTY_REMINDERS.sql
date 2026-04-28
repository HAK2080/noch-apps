-- LOYALTY_REMINDERS.sql
-- Outbox-based reminder system for loyalty.
-- Run in Supabase SQL Editor. Idempotent (safe to re-run).
--
-- Architecture:
--   1. loyalty_messages_outbox    — queue table holding pending/sent messages
--   2. loyalty_queue_message(...)  — helper that inserts with built-in dedupe
--   3. loyalty_birthday_run()      — daily: grant birthday reward + queue WA message
--   4. loyalty_inactivity_run()    — daily: queue "we miss you" for sad/tired/deathbed
--   5. loyalty_expiring_run()      — daily: queue reminder when reward < 3 days to expiry
--   6. tier-up trigger             — queues WA when tier crosses upward
--
-- Delivery: a Supabase edge function `send-loyalty-outbox` (separate file) reads
-- pending rows and calls Twilio. That function holds the auth token via Supabase
-- secrets — NEVER hardcoded in this SQL or in any committed file.

-- ── Schema additions for our customer-facing flow (idempotent) ──────
alter table public.loyalty_rewards   add column if not exists metadata     jsonb not null default '{}'::jsonb;
alter table public.loyalty_qr_tokens add column if not exists customer_id  uuid references public.loyalty_customers(id) on delete cascade;
alter table public.loyalty_qr_tokens add column if not exists drink_choice text;

-- ── Outbox ───────────────────────────────────────────────────────────
create table if not exists public.loyalty_messages_outbox (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references public.loyalty_customers(id) on delete cascade,
  channel       text not null check (channel in ('whatsapp','sms','telegram')),
  to_phone      text not null,
  message_text  text not null,
  message_kind  text not null check (message_kind in ('birthday','miss_you','reward_expiring','tier_up','custom')),
  status        text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts      int  not null default 0,
  error         text,
  twilio_sid    text,
  scheduled_at  timestamptz not null default now(),
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  metadata      jsonb not null default '{}'::jsonb
);

create index if not exists idx_outbox_pending  on public.loyalty_messages_outbox(status, scheduled_at) where status = 'pending';
create index if not exists idx_outbox_customer on public.loyalty_messages_outbox(customer_id);
create index if not exists idx_outbox_kind     on public.loyalty_messages_outbox(message_kind, created_at);

alter table public.loyalty_messages_outbox enable row level security;

drop policy if exists "service role full"   on public.loyalty_messages_outbox;
create policy "service role full" on public.loyalty_messages_outbox
  for all to service_role using (true) with check (true);

drop policy if exists "authenticated read"  on public.loyalty_messages_outbox;
create policy "authenticated read" on public.loyalty_messages_outbox
  for select to authenticated using (true);

-- ── Phone normalization to E.164 (Libya defaults) ────────────────────
create or replace function public.loyalty_to_e164(p text)
returns text language sql immutable as $$
  with c as (select regexp_replace(coalesce(p,''), '[^0-9+]', '', 'g') as v)
  select case
    when v like '+%'                            then v
    when v like '00%'                           then '+' || substr(v, 3)
    when length(v) = 9 and v like '0%'          then '+218' || substr(v, 2)
    when length(v) = 9 and v not like '0%'      then '+218' || v
    when length(v) = 12 and v like '218%'       then '+' || v
    else '+' || v
  end
  from c;
$$;

-- ── Queue helper with dedupe ─────────────────────────────────────────
create or replace function public.loyalty_queue_message(
  p_customer_id   uuid,
  p_channel       text,
  p_to_phone      text,
  p_message_text  text,
  p_kind          text,
  p_metadata      jsonb default '{}'::jsonb,
  p_dedupe_window interval default '24 hours'
)
returns uuid
security definer
set search_path = public
language plpgsql as $$
declare v_id uuid;
begin
  if exists (
    select 1 from loyalty_messages_outbox
     where customer_id = p_customer_id
       and message_kind = p_kind
       and status in ('pending','sending','sent')
       and created_at > now() - p_dedupe_window
  ) then
    return null;
  end if;

  insert into loyalty_messages_outbox (customer_id, channel, to_phone, message_text, message_kind, metadata)
  values (p_customer_id, p_channel, loyalty_to_e164(p_to_phone), p_message_text, p_kind, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end; $$;

revoke execute on function public.loyalty_queue_message(uuid,text,text,text,text,jsonb,interval) from public;
grant  execute on function public.loyalty_queue_message(uuid,text,text,text,text,jsonb,interval) to service_role, authenticated;

-- ── 1. Birthday: grant reward + queue WA ────────────────────────────
create or replace function public.loyalty_birthday_run()
returns int
security definer
set search_path = public
language plpgsql as $$
declare
  v_count int := 0;
  v_c     record;
  v_first text;
begin
  for v_c in
    select id, full_name, phone, birthday
      from loyalty_customers
     where birthday is not null
       and to_char(birthday, 'MM-DD') = to_char((now() at time zone 'Africa/Tripoli')::date, 'MM-DD')
       and not exists (
         select 1 from loyalty_rewards r
          where r.customer_id = loyalty_customers.id
            and (r.metadata->>'kind') = 'birthday'
            and date_trunc('year', r.created_at) = date_trunc('year', now())
       )
  loop
    insert into loyalty_rewards (customer_id, status, expires_at, description, metadata)
    values (
      v_c.id, 'pending', now() + interval '14 days',
      'Free drink of your choice — happy birthday from Nochi!',
      jsonb_build_object('kind','birthday','year', extract(year from now()))
    );

    v_first := coalesce(nullif(split_part(v_c.full_name, ' ', 1), ''), 'friend');

    perform loyalty_queue_message(
      v_c.id, 'whatsapp', v_c.phone,
      E'🎉 Happy birthday, ' || v_first || E'! 🐇\n\nNochi has a free drink of your choice waiting for you — pick anything, on us. Open your card or just walk in:\n\nhttps://noch.cloud/#loyalty\n\nValid 14 days.',
      'birthday',
      jsonb_build_object('year', extract(year from now())),
      interval '300 days'  -- only one birthday msg per year
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

grant execute on function public.loyalty_birthday_run() to service_role;

-- ── 2. Inactivity ───────────────────────────────────────────────────
create or replace function public.loyalty_inactivity_run()
returns int
security definer
set search_path = public
language plpgsql as $$
declare
  v_count int := 0;
  v_c     record;
  v_first text;
  v_msg   text;
begin
  for v_c in
    select id, full_name, phone, nochi_state
      from loyalty_customers
     where nochi_state in ('sad','tired','deathbed')
  loop
    v_first := coalesce(nullif(split_part(v_c.full_name, ' ', 1), ''), 'friend');
    v_msg := case v_c.nochi_state
      when 'sad'      then E'☕ Hey ' || v_first || E', long time no sip. Nochi misses you! Drop by — your stamps are still waiting.\n\nhttps://noch.cloud/#loyalty'
      when 'tired'    then E'😴 ' || v_first || E', it has been a while. Nochi keeps glancing at the door.\n\nhttps://noch.cloud/#loyalty'
      when 'deathbed' then E'🚨 ' || v_first || E', caffeine emergency! Nochi is calling out for you. Visit soon?\n\nhttps://noch.cloud/#loyalty'
    end;

    if loyalty_queue_message(
        v_c.id, 'whatsapp', v_c.phone, v_msg, 'miss_you',
        jsonb_build_object('state', v_c.nochi_state),
        interval '30 days'
      ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end; $$;

grant execute on function public.loyalty_inactivity_run() to service_role;

-- ── 3. Reward expiring ──────────────────────────────────────────────
create or replace function public.loyalty_expiring_run()
returns int
security definer
set search_path = public
language plpgsql as $$
declare
  v_count int := 0;
  v_r     record;
  v_first text;
  v_days  int;
begin
  for v_r in
    select c.id as customer_id, c.full_name, c.phone, r.id as reward_id, r.expires_at, r.description
      from loyalty_rewards r
      join loyalty_customers c on c.id = r.customer_id
     where r.status = 'pending'
       and r.expires_at between now() and now() + interval '3 days'
  loop
    v_first := coalesce(nullif(split_part(v_r.full_name, ' ', 1), ''), 'friend');
    v_days  := greatest(1, ceil(extract(epoch from (v_r.expires_at - now())) / 86400.0)::int);

    if loyalty_queue_message(
        v_r.customer_id, 'whatsapp', v_r.phone,
        E'⏰ ' || v_first || E', your free drink expires in ' || v_days || E' day' || case when v_days = 1 then '' else 's' end || E'! Don''t leave it on the table.\n\nhttps://noch.cloud/#loyalty',
        'reward_expiring',
        jsonb_build_object('reward_id', v_r.reward_id),
        interval '4 days'
      ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end; $$;

grant execute on function public.loyalty_expiring_run() to service_role;

-- ── 4. Tier upgrade trigger ─────────────────────────────────────────
create or replace function public.loyalty_tier_change_trigger()
returns trigger
security definer
set search_path = public
language plpgsql as $$
declare
  v_rank     int;
  v_old_rank int;
  v_first    text;
begin
  v_rank := case new.tier
              when 'silver' then 1
              when 'gold'   then 2
              when 'legend' then 3
              else 0
            end;
  v_old_rank := case old.tier
                  when 'silver' then 1
                  when 'gold'   then 2
                  when 'legend' then 3
                  else 0
                end;

  if v_rank > coalesce(v_old_rank, 0) then
    v_first := coalesce(nullif(split_part(new.full_name, ' ', 1), ''), 'friend');
    perform loyalty_queue_message(
      new.id, 'whatsapp', new.phone,
      E'🎉 ' || v_first || E', you just leveled up to *' ||
        case new.tier
          when 'silver' then 'Crew'
          when 'gold'   then 'Inner Circle'
          when 'legend' then 'Nochi BFF'
          else 'Friend'
        end ||
        E'* in the Nochi crew! 🐇\n\nhttps://noch.cloud/#loyalty',
      'tier_up',
      jsonb_build_object('tier', new.tier),
      interval '7 days'
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_loyalty_tier_up on public.loyalty_customers;
create trigger trg_loyalty_tier_up
after update of tier on public.loyalty_customers
for each row execute function public.loyalty_tier_change_trigger();

-- ── pg_cron schedules (Supabase enables pg_cron by default) ─────────
-- Run after the above is applied. If pg_cron isn't installed, fall back to
-- the Supabase Dashboard → Database → Cron Jobs UI.
--
-- create extension if not exists pg_cron;
--
-- select cron.schedule('loyalty-birthday-run',   '5 6 * * *',  $$ select public.loyalty_birthday_run();   $$);
-- select cron.schedule('loyalty-inactivity-run','15 7 * * *', $$ select public.loyalty_inactivity_run(); $$);
-- select cron.schedule('loyalty-expiring-run',  '25 9 * * *', $$ select public.loyalty_expiring_run();   $$);
--
-- Then trigger the edge function dispatcher every minute (Supabase scheduled
-- functions or pg_cron + http extension):
-- select cron.schedule('loyalty-outbox-dispatch','* * * * *',
--   $$ select net.http_post('https://<your-project-ref>.supabase.co/functions/v1/send-loyalty-outbox',
--                            headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>'),
--                            body := '{}'::jsonb); $$);
