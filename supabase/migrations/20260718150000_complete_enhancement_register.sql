-- Complete the remaining cross-module enhancement register.
-- Canonical FX, inventory variance, loyalty outcomes, daily close delivery,
-- and automated Vestaboard channels. Additive and safe to re-run.

-- ── Canonical exchange rates ───────────────────────────────────────────────
create table if not exists public.currency_rates (
  currency text primary key,
  rate_to_lyd numeric(14,6) not null check (rate_to_lyd > 0),
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.currency_rates add column if not exists source text not null default 'manual';
alter table public.currency_rates add column if not exists updated_at timestamptz not null default now();
alter table public.currency_rates add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.currency_rates drop constraint if exists currency_rates_currency_check;
alter table public.currency_rates add constraint currency_rates_currency_check check (currency ~ '^[A-Z]{3}$');

alter table public.currency_rates enable row level security;
drop policy if exists currency_rates_read on public.currency_rates;
create policy currency_rates_read on public.currency_rates for select to authenticated using (true);
drop policy if exists currency_rates_owner_write on public.currency_rates;
create policy currency_rates_owner_write on public.currency_rates for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

do $$
begin
  if to_regclass('public.cc_exchange_rates') is not null then
    insert into public.currency_rates(currency, rate_to_lyd, source, updated_at)
    select upper(currency), rate_to_lyd, 'legacy_expenses', coalesce(updated_at, now())
    from public.cc_exchange_rates
    where rate_to_lyd > 0
    on conflict (currency) do update set
      rate_to_lyd = excluded.rate_to_lyd,
      updated_at = greatest(currency_rates.updated_at, excluded.updated_at);
  end if;
end $$;

insert into public.currency_rates(currency, rate_to_lyd, source)
values ('LYD', 1, 'base')
on conflict (currency) do nothing;

create or replace function public.sync_canonical_fx_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.currency := upper(new.currency);
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);

  if new.currency = 'USD' and to_regclass('public.finance_settings') is not null then
    update public.finance_settings
    set usd_reference_rate_lyd = new.rate_to_lyd,
        usd_reference_rate_set_at = current_date,
        updated_at = now()
    where id = 'default';
  end if;

  if to_regclass('public.cc_exchange_rates') is not null then
    insert into public.cc_exchange_rates(currency, rate_to_lyd, updated_at)
    values (new.currency, new.rate_to_lyd, now())
    on conflict (currency) do update set rate_to_lyd = excluded.rate_to_lyd, updated_at = excluded.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_canonical_fx_rate on public.currency_rates;
create trigger trg_sync_canonical_fx_rate
before insert or update on public.currency_rates
for each row execute function public.sync_canonical_fx_rate();

-- ── Theoretical ingredient stock and count variance ────────────────────────
alter table public.stock add column if not exists last_counted_at timestamptz;
alter table public.stock add column if not exists last_counted_by uuid references public.profiles(id) on delete set null;
update public.stock set last_counted_at = coalesce(last_counted_at, updated_at, now()) where last_counted_at is null;

create or replace function public.inventory_theoretical_status()
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  counted_qty numeric,
  consumed_since_count numeric,
  theoretical_qty numeric,
  min_threshold numeric,
  last_counted_at timestamptz,
  count_is_stale boolean
)
language sql stable security definer set search_path = public as $$
  select
    i.id,
    i.name,
    s.unit,
    coalesce(s.qty_available, 0)::numeric,
    coalesce(usage.consumed, 0)::numeric,
    greatest(coalesce(s.qty_available, 0) - coalesce(usage.consumed, 0), 0)::numeric,
    coalesce(s.min_threshold, 0)::numeric,
    s.last_counted_at,
    coalesce(s.last_counted_at < now() - interval '7 days', true)
  from public.stock s
  join public.ingredients i on i.id = s.ingredient_id
  left join lateral (
    select sum(oi.quantity * coalesce(ri.qty_used, i.default_qty_per_serve, 0)) as consumed
    from public.pos_orders o
    join public.pos_order_items oi on oi.order_id = o.id
    join public.pos_products pp on pp.id = oi.product_id
    left join public.recipe_ingredients ri
      on ri.recipe_id = pp.cost_recipe_id and ri.ingredient_id = i.id
    where o.status = 'completed'
      and o.created_at >= coalesce(s.last_counted_at, s.updated_at, now())
      and (ri.ingredient_id is not null or (pp.cost_recipe_id is null and i.default_qty_per_serve is not null))
  ) usage on true;
$$;
grant execute on function public.inventory_theoretical_status() to authenticated;

create or replace function public.record_stock_count(
  p_ingredient_id uuid,
  p_counted_qty numeric,
  p_unit text default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before public.stock;
  v_theoretical numeric;
begin
  if p_counted_qty < 0 then raise exception 'Count cannot be negative'; end if;
  select * into v_before from public.stock where ingredient_id = p_ingredient_id for update;
  select theoretical_qty into v_theoretical
  from public.inventory_theoretical_status() where ingredient_id = p_ingredient_id;

  insert into public.stock(ingredient_id, qty_available, unit, min_threshold, updated_at, last_counted_at, last_counted_by)
  values (p_ingredient_id, p_counted_qty, coalesce(p_unit, v_before.unit), coalesce(v_before.min_threshold, 0), now(), now(), auth.uid())
  on conflict (ingredient_id) do update set
    qty_available = excluded.qty_available,
    unit = coalesce(excluded.unit, stock.unit),
    updated_at = now(),
    last_counted_at = now(),
    last_counted_by = auth.uid();

  insert into public.stock_logs(ingredient_id, qty_change, type, notes)
  values (
    p_ingredient_id,
    p_counted_qty - coalesce(v_before.qty_available, 0),
    'manual_count',
    concat_ws(' | ', nullif(p_notes, ''), 'theoretical=' || round(coalesce(v_theoretical, 0), 3),
      'variance=' || round(p_counted_qty - coalesce(v_theoretical, 0), 3))
  );
  return jsonb_build_object('counted', p_counted_qty, 'theoretical', coalesce(v_theoretical, 0),
    'variance', p_counted_qty - coalesce(v_theoretical, 0));
end $$;
grant execute on function public.record_stock_count(uuid, numeric, text, text) to authenticated;

-- ── Loyalty checkout integration and outcome reporting ─────────────────────
create or replace function public.lookup_or_create_loyalty_customer(p_phone text)
returns public.loyalty_customers
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_customer public.loyalty_customers;
begin
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 then
    raise exception 'Enter at least 7 phone digits';
  end if;
  select * into v_customer from public.loyalty_customers
  where regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g')
  limit 1;
  if v_customer.id is null then
    insert into public.loyalty_customers(phone, full_name, registered_by)
    values (v_phone, 'Guest ' || right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 4), auth.uid())
    returning * into v_customer;
  end if;
  return v_customer;
end $$;
grant execute on function public.lookup_or_create_loyalty_customer(text) to authenticated;

create or replace function public.loyalty_checkout_metrics(p_days integer default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  with orders as (
    select id, loyalty_customer_id, created_at,
      row_number() over (partition by loyalty_customer_id order by created_at) as customer_visit_number
    from public.pos_orders
    where status = 'completed' and created_at >= now() - make_interval(days => greatest(p_days, 1))
  ), totals as (
    select count(*) total_orders,
      count(*) filter (where loyalty_customer_id is not null) attached_orders,
      count(*) filter (where loyalty_customer_id is not null and customer_visit_number > 1) repeat_orders
    from orders
  )
  select jsonb_build_object(
    'days', greatest(p_days, 1),
    'total_orders', total_orders,
    'attached_orders', attached_orders,
    'attach_rate', round(100.0 * attached_orders / nullif(total_orders, 0), 1),
    'repeat_orders', repeat_orders,
    'repeat_visit_rate', round(100.0 * repeat_orders / nullif(attached_orders, 0), 1)
  ) from totals;
$$;
grant execute on function public.loyalty_checkout_metrics(integer) to authenticated;

create or replace function public.loyalty_staff_leaderboard(p_days integer default 30)
returns table(profile_id uuid, full_name text, signups bigint, stamps bigint, total_actions bigint)
language sql stable security definer set search_path = public as $$
  with signups as (
    select registered_by profile_id, count(*) signups
    from public.loyalty_customers
    where registered_by is not null and created_at >= now() - make_interval(days => greatest(p_days, 1))
    group by registered_by
  ), stamps as (
    select awarded_by profile_id, count(*) stamps
    from public.loyalty_stamps
    where awarded_by is not null and created_at >= now() - make_interval(days => greatest(p_days, 1))
    group by awarded_by
  )
  select p.id, p.full_name, coalesce(su.signups, 0), coalesce(st.stamps, 0),
    coalesce(su.signups, 0) + coalesce(st.stamps, 0)
  from public.profiles p
  left join signups su on su.profile_id = p.id
  left join stamps st on st.profile_id = p.id
  where coalesce(su.signups, 0) + coalesce(st.stamps, 0) > 0
  order by 5 desc, p.full_name;
$$;
grant execute on function public.loyalty_staff_leaderboard(integer) to authenticated;

-- ── Scheduled 5 AM close report ────────────────────────────────────────────
create table if not exists public.daily_close_subscriptions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.pos_branches(id) on delete cascade,
  telegram_chat_id text not null,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(branch_id, telegram_chat_id)
);
alter table public.daily_close_subscriptions enable row level security;
drop policy if exists daily_close_owner_all on public.daily_close_subscriptions;
create policy daily_close_owner_all on public.daily_close_subscriptions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

insert into public.daily_close_subscriptions(branch_id, telegram_chat_id, created_by)
select b.id, p.telegram_chat_id, p.id
from public.pos_branches b cross join public.profiles p
where b.is_active = true and p.role = 'owner' and nullif(p.telegram_chat_id, '') is not null
on conflict (branch_id, telegram_chat_id) do nothing;

-- ── Noch Channels ──────────────────────────────────────────────────────────
create table if not exists public.vestaboard_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel_type text not null check (channel_type in ('weather','quote','trivia','sales','loyalty','special','custom')),
  enabled boolean not null default true,
  cadence_minutes integer not null default 60 check (cadence_minutes between 15 and 10080),
  start_hour smallint not null default 9 check (start_hour between 0 and 23),
  end_hour smallint not null default 23 check (end_hour between 0 and 23),
  priority smallint not null default 10,
  config jsonb not null default '{}'::jsonb,
  last_enqueued_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vestaboard_channels_name_uidx on public.vestaboard_channels(lower(name));
alter table public.vestaboard_channels enable row level security;
drop policy if exists vestaboard_channels_read on public.vestaboard_channels;
create policy vestaboard_channels_read on public.vestaboard_channels for select to authenticated using (true);
drop policy if exists vestaboard_channels_owner_write on public.vestaboard_channels;
create policy vestaboard_channels_owner_write on public.vestaboard_channels for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

insert into public.vestaboard_channels(name, channel_type, cadence_minutes, priority, config)
values
  ('Tripoli Weather', 'weather', 60, 20, '{}'::jsonb),
  ('Nochi Quote', 'quote', 180, 10, '{}'::jsonb),
  ('Daily Sales', 'sales', 240, 30, '{}'::jsonb),
  ('Loyalty Milestones', 'loyalty', 120, 40, '{}'::jsonb)
on conflict do nothing;

create or replace function public.daily_close_report_payload(p_branch_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with latest as (
    select d.*
    from public.pos_sales_daily d
    where d.branch_id = p_branch_id
      and d.day < (date_trunc('day', (now() at time zone 'Africa/Tripoli') - interval '5 hours'))::date
    order by d.day desc limit 1
  ), prior as (
    select d.* from public.pos_sales_daily d, latest l
    where d.branch_id = p_branch_id and d.day = l.day - 7
  ), bounds as (
    select
      (l.day::timestamp + interval '5 hours') at time zone 'Africa/Tripoli' as from_at,
      ((l.day + 1)::timestamp + interval '5 hours') at time zone 'Africa/Tripoli' as to_at
    from latest l
  ), products as (
    select jsonb_agg(jsonb_build_object('name', x.product_name, 'qty', x.qty) order by x.qty desc) top_products
    from (
      select oi.product_name, sum(oi.quantity)::numeric qty
      from public.pos_orders o join public.pos_order_items oi on oi.order_id = o.id cross join bounds b
      where o.branch_id = p_branch_id and o.status = 'completed'
        and o.created_at >= b.from_at and o.created_at < b.to_at
      group by oi.product_name order by qty desc limit 3
    ) x
  ), loyalty as (
    select coalesce(sum(a.stamp_count), 0)::bigint stamps
    from public.loyalty_order_awards a join public.pos_orders o on o.id = a.order_id cross join bounds b
    where o.branch_id = p_branch_id and a.awarded_at >= b.from_at and a.awarded_at < b.to_at
  ), snaps as (
    select count(*)::bigint snapped_expenses from public.expense_snaps s cross join bounds b
    where s.created_at >= b.from_at and s.created_at < b.to_at
  )
  select jsonb_build_object(
    'branch_id', b.id, 'branch_name', b.name, 'day', l.day,
    'orders', coalesce(l.orders, 0), 'gross', coalesce(l.gross, 0),
    'cash', coalesce(l.cash_sales, 0), 'card', coalesce(l.card_sales, 0),
    'split', coalesce(l.split_sales, 0), 'refunds', coalesce(l.refunds, 0),
    'last_week_gross', coalesce(p.gross, 0),
    'gross_change_pct', round(100 * (coalesce(l.gross, 0) - coalesce(p.gross, 0)) / nullif(p.gross, 0), 1),
    'top_products', coalesce(products.top_products, '[]'::jsonb),
    'stamps', loyalty.stamps, 'snapped_expenses', snaps.snapped_expenses
  )
  from public.pos_branches b
  join latest l on true
  left join prior p on true
  cross join products cross join loyalty cross join snaps
  where b.id = p_branch_id;
$$;
grant execute on function public.daily_close_report_payload(uuid) to service_role, authenticated;

do $$
declare v_job bigint;
begin
  if to_regnamespace('cron') is not null then
    select jobid into v_job from cron.job where jobname = 'daily-close-report-0505' limit 1;
    if v_job is not null then perform cron.unschedule(v_job); end if;
    perform cron.schedule('daily-close-report-0505', '5 3 * * *', $cron$
      select net.http_post(
        url := 'https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/daily-close-report',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$);

    select jobid into v_job from cron.job where jobname = 'vestaboard-channels-every-15m' limit 1;
    if v_job is not null then perform cron.unschedule(v_job); end if;
    perform cron.schedule('vestaboard-channels-every-15m', '*/15 * * * *', $cron$
      select net.http_post(
        url := 'https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/vestaboard-cron',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$);
  end if;
end $$;

notify pgrst, 'reload schema';
