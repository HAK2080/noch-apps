-- ============================================================
-- NOCHI PASS — Phase 2 polish v2
-- - favorite_drinks text[]: up to 3 picks (replaces the single
--   favorite_drink slot for the Pass UI; old column kept for read
--   compatibility and backfilled into the array).
-- - facebook_handle text: new self-edit field.
-- - update_passport_preferences: now accepts the full WhatsApp
--   number (`p_phone`) instead of the previous 4-digit code, and
--   compares digits-only on the last 9 digits (Libya local).
-- - get_public_passport: surfaces favorite_drinks + facebook_handle.
-- Re-runnable.
-- ============================================================

alter table loyalty_customers
  add column if not exists favorite_drinks text[] not null default '{}',
  add column if not exists facebook_handle text;

-- One-shot backfill: seed favorite_drinks[] from favorite_drink so
-- existing customers see their pick on first load. Idempotent — only
-- seeds when the array is still empty.
update loyalty_customers
set favorite_drinks = array[favorite_drink]
where favorite_drink is not null
  and favorite_drink <> ''
  and (favorite_drinks is null or array_length(favorite_drinks, 1) is null);

-- ── get_public_passport ─────────────────────────────────────────
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
    'favorite_drinks',      to_jsonb(coalesce(v_customer.favorite_drinks, '{}'::text[])),
    'favorite_other',       v_customer.favorite_other,
    'milk_preference',      v_customer.milk_preference,
    'sweetness_preference', v_customer.sweetness_preference,
    'instagram_handle',     v_customer.instagram_handle,
    'tiktok_handle',        v_customer.tiktok_handle,
    'facebook_handle',      v_customer.facebook_handle,
    'whatsapp_opt_in',      v_customer.whatsapp_opt_in,
    'pending_rewards',      v_pending
  );
end;
$$;

grant execute on function get_public_passport(uuid) to anon;
grant execute on function get_public_passport(uuid) to authenticated;

-- ── update_passport_preferences (new signature) ─────────────────
-- Drop the old 4-digit-last4 signature so callers can't accidentally
-- use it; the new RPC takes the full phone number.
drop function if exists update_passport_preferences(uuid, text, jsonb);

create or replace function update_passport_preferences(
  p_token uuid,
  p_phone text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer loyalty_customers%rowtype;
  v_stored_digits text;
  v_input_digits  text;
  v_match_len int;
  v_favorite_other text;
  v_milk_preference text;
  v_sweetness_preference text;
  v_instagram_handle text;
  v_tiktok_handle text;
  v_facebook_handle text;
  v_whatsapp_opt_in boolean;
  v_birthday_day int;
  v_birthday_month int;
  v_drinks text[];
  v_drink_in jsonb;
  v_first_drink text;
begin
  if p_token is null or p_phone is null then
    return jsonb_build_object('ok', false, 'error', 'missing_args');
  end if;

  select * into v_customer
  from loyalty_customers
  where passport_token = p_token
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Digits-only comparison; allow with-or-without country code by
  -- matching the last min(input,stored,9) digits.
  v_stored_digits := regexp_replace(coalesce(v_customer.phone, ''), '[^0-9]', '', 'g');
  v_input_digits  := regexp_replace(coalesce(p_phone, ''),         '[^0-9]', '', 'g');

  if length(v_input_digits) < 6 then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;

  v_match_len := least(length(v_stored_digits), length(v_input_digits), 9);
  if v_match_len = 0 or right(v_stored_digits, v_match_len) <> right(v_input_digits, v_match_len) then
    return jsonb_build_object('ok', false, 'error', 'verify_failed');
  end if;

  -- Whitelisted text fields
  v_favorite_other       := nullif(trim(p_updates->>'favorite_other'), '');
  v_milk_preference      := nullif(trim(p_updates->>'milk_preference'), '');
  v_sweetness_preference := nullif(trim(p_updates->>'sweetness_preference'), '');
  v_instagram_handle     := nullif(trim(p_updates->>'instagram_handle'), '');
  v_tiktok_handle        := nullif(trim(p_updates->>'tiktok_handle'), '');
  v_facebook_handle      := nullif(trim(p_updates->>'facebook_handle'), '');

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

  -- favorite_drinks: jsonb array → text[], trim, drop empties, cap to 3.
  if p_updates ? 'favorite_drinks' then
    v_drinks := array[]::text[];
    for v_drink_in in select * from jsonb_array_elements(p_updates->'favorite_drinks')
    loop
      if v_drink_in is not null and jsonb_typeof(v_drink_in) = 'string' then
        v_drinks := array_append(v_drinks,
          nullif(trim(v_drink_in #>> '{}'), '')
        );
      end if;
    end loop;
    -- strip nulls + dedupe (preserve order)
    v_drinks := array(
      select x from (
        select x, row_number() over (partition by lower(x) order by ord) rn, ord
        from unnest(v_drinks) with ordinality as t(x, ord)
        where x is not null
      ) s where rn = 1 order by ord
    );
    if array_length(v_drinks, 1) > 3 then
      v_drinks := v_drinks[1:3];
    end if;
    v_first_drink := coalesce(v_drinks[1], null);
  end if;

  update loyalty_customers
  set
    favorite_drinks      = case when p_updates ? 'favorite_drinks' then v_drinks else favorite_drinks end,
    favorite_drink       = case when p_updates ? 'favorite_drinks' then v_first_drink else favorite_drink end,
    favorite_other       = case when p_updates ? 'favorite_other' then v_favorite_other else favorite_other end,
    milk_preference      = coalesce(v_milk_preference,      milk_preference),
    sweetness_preference = coalesce(v_sweetness_preference, sweetness_preference),
    instagram_handle     = coalesce(v_instagram_handle,     instagram_handle),
    tiktok_handle        = coalesce(v_tiktok_handle,        tiktok_handle),
    facebook_handle      = coalesce(v_facebook_handle,      facebook_handle),
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
