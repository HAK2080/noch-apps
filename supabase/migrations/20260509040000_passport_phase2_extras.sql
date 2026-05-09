-- ============================================================
-- NOCHI PASSPORT — Phase 2 polish
-- - Adds favorite_other (free-text "bakery, cakes, etc.") column
-- - get_public_passport: surfaces favorite_other
-- - update_passport_preferences: accepts favorite_other
-- Re-runnable.
-- ============================================================

alter table loyalty_customers
  add column if not exists favorite_other text;

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
    'birthday_day',         v_customer.birthday_day,
    'birthday_month',       v_customer.birthday_month,
    'favorite_drink',       v_customer.favorite_drink,
    'favorite_other',       v_customer.favorite_other,
    'milk_preference',      v_customer.milk_preference,
    'sweetness_preference', v_customer.sweetness_preference,
    'instagram_handle',     v_customer.instagram_handle,
    'tiktok_handle',        v_customer.tiktok_handle,
    'whatsapp_opt_in',      v_customer.whatsapp_opt_in,
    'pending_rewards',      v_pending
  );
end;
$$;

grant execute on function get_public_passport(uuid) to anon;
grant execute on function get_public_passport(uuid) to authenticated;

create or replace function update_passport_preferences(
  p_token uuid,
  p_phone_last4 text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer loyalty_customers%rowtype;
  v_phone_last4 text;
  v_favorite_drink text;
  v_favorite_other text;
  v_milk_preference text;
  v_sweetness_preference text;
  v_instagram_handle text;
  v_tiktok_handle text;
  v_whatsapp_opt_in boolean;
  v_birthday_day int;
  v_birthday_month int;
begin
  if p_token is null or p_phone_last4 is null then
    return jsonb_build_object('ok', false, 'error', 'missing_args');
  end if;

  if length(p_phone_last4) <> 4 or p_phone_last4 !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_last4');
  end if;

  select * into v_customer
  from loyalty_customers
  where passport_token = p_token
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_phone_last4 := right(regexp_replace(coalesce(v_customer.phone, ''), '[^0-9]', '', 'g'), 4);

  if v_phone_last4 is null or v_phone_last4 = '' or v_phone_last4 <> p_phone_last4 then
    return jsonb_build_object('ok', false, 'error', 'verify_failed');
  end if;

  v_favorite_drink       := nullif(trim(p_updates->>'favorite_drink'), '');
  v_favorite_other       := nullif(trim(p_updates->>'favorite_other'), '');
  v_milk_preference      := nullif(trim(p_updates->>'milk_preference'), '');
  v_sweetness_preference := nullif(trim(p_updates->>'sweetness_preference'), '');
  v_instagram_handle     := nullif(trim(p_updates->>'instagram_handle'), '');
  v_tiktok_handle        := nullif(trim(p_updates->>'tiktok_handle'), '');

  if p_updates ? 'whatsapp_opt_in' then
    v_whatsapp_opt_in := (p_updates->>'whatsapp_opt_in')::boolean;
  end if;

  if p_updates ? 'birthday_day' then
    v_birthday_day := nullif(p_updates->>'birthday_day', '')::int;
    if v_birthday_day is not null and (v_birthday_day < 1 or v_birthday_day > 31) then
      return jsonb_build_object('ok', false, 'error', 'bad_birthday');
    end if;
  end if;
  if p_updates ? 'birthday_month' then
    v_birthday_month := nullif(p_updates->>'birthday_month', '')::int;
    if v_birthday_month is not null and (v_birthday_month < 1 or v_birthday_month > 12) then
      return jsonb_build_object('ok', false, 'error', 'bad_birthday');
    end if;
  end if;

  update loyalty_customers
  set
    favorite_drink       = case when p_updates ? 'favorite_drink' then v_favorite_drink else favorite_drink end,
    favorite_other       = case when p_updates ? 'favorite_other' then v_favorite_other else favorite_other end,
    milk_preference      = coalesce(v_milk_preference,      milk_preference),
    sweetness_preference = coalesce(v_sweetness_preference, sweetness_preference),
    instagram_handle     = coalesce(v_instagram_handle,     instagram_handle),
    tiktok_handle        = coalesce(v_tiktok_handle,        tiktok_handle),
    whatsapp_opt_in      = coalesce(v_whatsapp_opt_in,      whatsapp_opt_in),
    birthday_day         = case when p_updates ? 'birthday_day'   then v_birthday_day   else birthday_day   end,
    birthday_month       = case when p_updates ? 'birthday_month' then v_birthday_month else birthday_month end,
    updated_at           = now()
  where id = v_customer.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function update_passport_preferences(uuid, text, jsonb) to anon;
grant execute on function update_passport_preferences(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
