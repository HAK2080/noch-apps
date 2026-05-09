-- ============================================================
-- NOCHI PASSPORT — PHASE 1 FOUNDATION
-- Adds customer-memory fields, passport tokens, and POS visit RPC.
-- Re-runnable.
-- ============================================================

-- 1. Memory fields on loyalty_customers
alter table loyalty_customers
  add column if not exists favorite_drink text,
  add column if not exists milk_preference text,
  add column if not exists sweetness_preference text,
  add column if not exists instagram_handle text,
  add column if not exists tiktok_handle text,
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists ugc_consent boolean not null default false,
  add column if not exists passport_token uuid not null default gen_random_uuid();

create unique index if not exists loyalty_customers_passport_token_idx
  on loyalty_customers(passport_token);

-- 2. Public Passport read RPC — anon-safe, whitelisted fields only.
create or replace function get_public_passport(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer loyalty_customers%rowtype;
  v_pending jsonb;
begin
  select * into v_customer
  from loyalty_customers
  where passport_token = p_token
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'reward_type', reward_type,
      'description', description,
      'expires_at', expires_at,
      'created_at', created_at
    ) order by created_at desc), '[]'::jsonb)
  into v_pending
  from loyalty_rewards
  where customer_id = v_customer.id
    and status = 'pending';

  return jsonb_build_object(
    'id',                   v_customer.id,
    'full_name',            v_customer.full_name,
    'tier',                 v_customer.tier,
    'nochi_state',          v_customer.nochi_state,
    'current_stamps',       v_customer.current_stamps,
    'total_stamps',         v_customer.total_stamps,
    'total_visits',         v_customer.total_visits,
    'current_streak',       v_customer.current_streak,
    'last_visit_at',        v_customer.last_visit_at,
    'favorite_drink',       v_customer.favorite_drink,
    'milk_preference',      v_customer.milk_preference,
    'sweetness_preference', v_customer.sweetness_preference,
    'instagram_handle',     v_customer.instagram_handle,
    'tiktok_handle',        v_customer.tiktok_handle,
    'whatsapp_opt_in',      v_customer.whatsapp_opt_in,
    'ugc_consent',          v_customer.ugc_consent,
    'pending_rewards',      v_pending
  );
end;
$$;

grant execute on function get_public_passport(uuid) to anon;
grant execute on function get_public_passport(uuid) to authenticated;

-- 3. POS visit recorder — bumps last_visit_at, increments total_visits
--    once per 2-hour window, backfills favorite_drink if empty.
create or replace function record_pos_customer_visit(
  p_customer_id uuid,
  p_favorite_drink text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer loyalty_customers%rowtype;
  v_should_increment boolean;
begin
  select * into v_customer
  from loyalty_customers
  where id = p_customer_id
  limit 1;

  if not found then
    return;
  end if;

  v_should_increment :=
    v_customer.last_visit_at is null
    or v_customer.last_visit_at < now() - interval '2 hours';

  update loyalty_customers
  set
    last_visit_at = now(),
    total_visits = case when v_should_increment then total_visits + 1 else total_visits end,
    favorite_drink = case
      when favorite_drink is null and p_favorite_drink is not null
      then p_favorite_drink
      else favorite_drink
    end,
    updated_at = now()
  where id = p_customer_id;
end;
$$;

grant execute on function record_pos_customer_visit(uuid, text) to authenticated;
grant execute on function record_pos_customer_visit(uuid, text) to service_role;
