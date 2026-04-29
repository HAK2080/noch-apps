-- Phase 2 WhatsApp marketing triggers
-- Builds:
--   1. whatsapp_sends ledger (dedupe + audit)
--   2. v_loyalty_top_drink view (per-customer most-ordered last 60d)
--   3. Eligibility RPCs (one per trigger type)
-- The whatsapp-cron edge function reads these RPCs nightly and fires sends.

-- 1) whatsapp_sends ledger ─────────────────────────────────────────────────
-- Tracks every outbound template send. Used to dedupe (don't fire same trigger
-- twice on same customer in cooldown window) and audit cost.

create table if not exists whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references loyalty_customers(id) on delete cascade,
  phone text not null,
  template_name text not null,
  trigger_kind text,                 -- 'anniversary' | 'birthday' | 'lapsed' | 'streak' | 'back_in_stock' | 'transactional' | null
  payload_key text,                  -- secondary dedupe key (e.g. product_id for back_in_stock)
  status text default 'sent',        -- 'sent' | 'failed'
  error text,
  sent_at timestamptz not null default now()
);

create index if not exists whatsapp_sends_customer_template_idx
  on whatsapp_sends (customer_id, template_name, sent_at desc);

create index if not exists whatsapp_sends_trigger_idx
  on whatsapp_sends (trigger_kind, sent_at desc);

-- 2) v_loyalty_top_drink ────────────────────────────────────────────────────
-- Per-customer most-ordered product over last 60 days. Used to personalize
-- weather_iced and anniversary templates with the customer's drink.

create or replace view v_loyalty_top_drink as
with recent_orders as (
  select
    o.customer_phone,
    oi.product_id,
    oi.quantity
  from pos_orders o
  join pos_order_items oi on oi.order_id = o.id
  where o.created_at >= (now() - interval '60 days')
    and coalesce(o.status, 'completed') in ('completed', 'paid', 'closed', 'pending')
    and o.customer_phone is not null
),
ranked as (
  select
    ro.customer_phone,
    p.name as product_name,
    sum(ro.quantity) as total_qty,
    row_number() over (partition by ro.customer_phone order by sum(ro.quantity) desc) as rk
  from recent_orders ro
  join pos_products p on p.id = ro.product_id
  group by ro.customer_phone, p.id, p.name
)
select
  lc.id as customer_id,
  lc.phone,
  lc.full_name,
  r.product_name as top_drink
from loyalty_customers lc
left join ranked r on r.customer_phone = lc.phone and r.rk = 1;

-- 3) Eligibility RPCs ──────────────────────────────────────────────────────

-- 3a) Anniversary — exactly N years since loyalty_customers.created_at, today.
create or replace function whatsapp_anniversary_recipients()
returns table (
  customer_id uuid, phone text, full_name text, top_drink text, years int
) security definer set search_path = public language sql as $$
  select
    lc.id, lc.phone, lc.full_name,
    coalesce(td.top_drink, 'مشروبك المفضل') as top_drink,
    extract(year from age(current_date, lc.created_at::date))::int as years
  from loyalty_customers lc
  left join v_loyalty_top_drink td on td.customer_id = lc.id
  where lc.phone is not null
    and lc.created_at::date <= current_date - interval '1 year'
    and to_char(lc.created_at, 'MM-DD') = to_char(current_date, 'MM-DD')
    and not exists (
      select 1 from whatsapp_sends ws
      where ws.customer_id = lc.id
        and ws.trigger_kind = 'anniversary'
        and ws.sent_at > now() - interval '60 days'
    );
$$;

grant execute on function whatsapp_anniversary_recipients() to authenticated;

-- 3b) Birthday — birthday MM-DD matches today.
create or replace function whatsapp_birthday_recipients()
returns table (
  customer_id uuid, phone text, full_name text
) security definer set search_path = public language sql as $$
  select lc.id, lc.phone, lc.full_name
  from loyalty_customers lc
  where lc.phone is not null
    and (
      (lc.birthday is not null and to_char(lc.birthday, 'MM-DD') = to_char(current_date, 'MM-DD'))
      or (lc.birthday_day = extract(day from current_date)::int
          and lc.birthday_month = extract(month from current_date)::int)
    )
    and not exists (
      select 1 from whatsapp_sends ws
      where ws.customer_id = lc.id
        and ws.trigger_kind = 'birthday'
        and ws.sent_at > now() - interval '60 days'
    );
$$;

grant execute on function whatsapp_birthday_recipients() to authenticated;

-- 3c) Lapsed check-in — last visit 30+ days ago, hasn't been pinged in 30 days.
create or replace function whatsapp_lapsed_recipients(p_days int default 30)
returns table (
  customer_id uuid, phone text, full_name text, days_since int
) security definer set search_path = public language sql as $$
  select
    lc.id, lc.phone, lc.full_name,
    extract(day from (now() - lc.last_visit_at))::int as days_since
  from loyalty_customers lc
  where lc.phone is not null
    and lc.last_visit_at is not null
    and lc.last_visit_at < (now() - make_interval(days => p_days))
    and lc.last_visit_at > (now() - interval '180 days')
    and not exists (
      select 1 from whatsapp_sends ws
      where ws.customer_id = lc.id
        and ws.trigger_kind = 'lapsed'
        and ws.sent_at > now() - interval '30 days'
    );
$$;

grant execute on function whatsapp_lapsed_recipients(int) to authenticated;

-- 3d) Streak save — current_streak >= 5, last visit was yesterday or 2 days ago.
create or replace function whatsapp_streak_save_recipients()
returns table (
  customer_id uuid, phone text, full_name text, streak int
) security definer set search_path = public language sql as $$
  select lc.id, lc.phone, lc.full_name, lc.current_streak
  from loyalty_customers lc
  where lc.phone is not null
    and lc.current_streak >= 5
    and lc.last_visit_at is not null
    and lc.last_visit_at::date = (current_date - interval '2 days')::date
    and not exists (
      select 1 from whatsapp_sends ws
      where ws.customer_id = lc.id
        and ws.trigger_kind = 'streak'
        and ws.sent_at > now() - interval '14 days'
    );
$$;

grant execute on function whatsapp_streak_save_recipients() to authenticated;

-- 3e) Weather iced — owner toggles `is_hot_day` flag; if true, ping customers
--     whose top drink isn't already iced (heuristic: no "ice" or "iced" or
--     "مثلج" in product name).
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('is_hot_day', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function whatsapp_weather_iced_recipients()
returns table (
  customer_id uuid, phone text, full_name text, top_drink text
) security definer set search_path = public language sql as $$
  select td.customer_id, td.phone, td.full_name, td.top_drink
  from v_loyalty_top_drink td
  join app_settings s on s.key = 'is_hot_day' and s.value::text = 'true'
  where td.phone is not null
    and td.top_drink is not null
    and td.top_drink !~* '(ice|iced|مثلج)'
    and not exists (
      select 1 from whatsapp_sends ws
      where ws.customer_id = td.customer_id
        and ws.trigger_kind = 'weather'
        and ws.sent_at > now() - interval '7 days'
    );
$$;

grant execute on function whatsapp_weather_iced_recipients() to authenticated;

-- Helper to record a send (called by edge function after Twilio confirms 200).
create or replace function record_whatsapp_send(
  p_customer_id uuid,
  p_phone text,
  p_template text,
  p_trigger text,
  p_status text default 'sent',
  p_error text default null,
  p_payload_key text default null
) returns uuid security definer set search_path = public language sql as $$
  insert into whatsapp_sends (customer_id, phone, template_name, trigger_kind, status, error, payload_key)
  values (p_customer_id, p_phone, p_template, p_trigger, p_status, p_error, p_payload_key)
  returning id;
$$;

grant execute on function record_whatsapp_send(uuid, text, text, text, text, text, text) to authenticated;
