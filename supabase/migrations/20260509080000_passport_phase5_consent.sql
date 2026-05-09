-- ============================================================
-- NOCHI PASS — Phase 5: consent timestamps + source
-- - ugc_consent_at      timestamptz: when the customer last set
--                       their UGC repost consent
-- - whatsapp_opt_in_at  timestamptz: same for WhatsApp marketing
-- - consent_source      text: where the consent was recorded
--                       ('passport_self_edit' | 'pos_attach' |
--                        'storefront_register' | 'staff_admin')
-- - get_public_passport: surface the timestamps + source
-- - update_passport_preferences: stamp the appropriate timestamp
--   when ugc_consent or whatsapp_opt_in is in p_updates
-- Re-runnable.
-- ============================================================

alter table loyalty_customers
  add column if not exists ugc_consent_at      timestamptz,
  add column if not exists whatsapp_opt_in_at  timestamptz,
  add column if not exists consent_source      text;

-- Backfill: existing rows that already have consent values get a
-- best-effort timestamp (their updated_at) and source 'legacy'.
-- Idempotent: only seeds when the timestamp is still null.
update loyalty_customers
set whatsapp_opt_in_at = coalesce(updated_at, now()),
    consent_source = coalesce(consent_source, 'legacy')
where whatsapp_opt_in is true
  and whatsapp_opt_in_at is null;

update loyalty_customers
set ugc_consent_at = coalesce(updated_at, now()),
    consent_source = coalesce(consent_source, 'legacy')
where ugc_consent is true
  and ugc_consent_at is null;

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
    'id',                    v_customer.id,
    'full_name',             v_customer.full_name,
    'tier',                  v_customer.tier,
    'nochi_state',           v_customer.nochi_state,
    'current_stamps',        v_customer.current_stamps,
    'total_stamps',          v_customer.total_stamps,
    'total_visits',          v_customer.total_visits,
    'current_streak',        v_customer.current_streak,
    'last_visit_at',         v_customer.last_visit_at,
    'birthday_day',          v_customer.birthday_day,
    'birthday_month',        v_customer.birthday_month,
    'favorite_drink',        v_customer.favorite_drink,
    'favorite_drinks',       to_jsonb(coalesce(v_customer.favorite_drinks, '{}'::text[])),
    'favorite_other',        v_customer.favorite_other,
    'milk_preference',       v_customer.milk_preference,
    'sweetness_preference',  v_customer.sweetness_preference,
    'instagram_handle',      v_customer.instagram_handle,
    'tiktok_handle',         v_customer.tiktok_handle,
    'facebook_handle',       v_customer.facebook_handle,
    'whatsapp_opt_in',       v_customer.whatsapp_opt_in,
    'whatsapp_opt_in_at',    v_customer.whatsapp_opt_in_at,
    'ugc_consent',           v_customer.ugc_consent,
    'ugc_consent_at',        v_customer.ugc_consent_at,
    'consent_source',        v_customer.consent_source,
    'referral_code',         v_customer.referral_code,
    'pending_rewards',       v_pending
  );
end;
$$;

grant execute on function get_public_passport(uuid) to anon;
grant execute on function get_public_passport(uuid) to authenticated;

-- ── update_passport_preferences ─────────────────────────────────
-- Same signature as Phase 2 v2 (uuid, text full-phone, jsonb).
-- Adds: stamps consent timestamps + source whenever the corresponding
-- flag is in p_updates. consent_source can be overridden via
-- p_updates.consent_source; defaults to 'passport_self_edit'.
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
  v_ugc_consent boolean;
  v_birthday_day int;
  v_birthday_month int;
  v_drinks text[];
  v_drink_in jsonb;
  v_first_drink text;
  v_consent_source text;
  v_now timestamptz := now();
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

  v_stored_digits := regexp_replace(coalesce(v_customer.phone, ''), '[^0-9]', '', 'g');
  v_input_digits  := regexp_replace(coalesce(p_phone, ''),         '[^0-9]', '', 'g');

  if length(v_input_digits) < 6 then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;

  v_match_len := least(length(v_stored_digits), length(v_input_digits), 9);
  if v_match_len = 0 or right(v_stored_digits, v_match_len) <> right(v_input_digits, v_match_len) then
    return jsonb_build_object('ok', false, 'error', 'verify_failed');
  end if;

  v_favorite_other       := nullif(trim(p_updates->>'favorite_other'), '');
  v_milk_preference      := nullif(trim(p_updates->>'milk_preference'), '');
  v_sweetness_preference := nullif(trim(p_updates->>'sweetness_preference'), '');
  v_instagram_handle     := nullif(trim(p_updates->>'instagram_handle'), '');
  v_tiktok_handle        := nullif(trim(p_updates->>'tiktok_handle'), '');
  v_facebook_handle      := nullif(trim(p_updates->>'facebook_handle'), '');

  if p_updates ? 'whatsapp_opt_in' then
    v_whatsapp_opt_in := (p_updates->>'whatsapp_opt_in')::boolean;
  end if;
  if p_updates ? 'ugc_consent' then
    v_ugc_consent := (p_updates->>'ugc_consent')::boolean;
  end if;

  v_consent_source := coalesce(nullif(trim(p_updates->>'consent_source'), ''), 'passport_self_edit');

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

  if p_updates ? 'favorite_drinks' then
    v_drinks := array[]::text[];
    for v_drink_in in select * from jsonb_array_elements(p_updates->'favorite_drinks')
    loop
      if v_drink_in is not null and jsonb_typeof(v_drink_in) = 'string' then
        v_drinks := array_append(v_drinks, nullif(trim(v_drink_in #>> '{}'), ''));
      end if;
    end loop;
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
    whatsapp_opt_in_at   = case
                             when p_updates ? 'whatsapp_opt_in'
                              and v_whatsapp_opt_in is distinct from whatsapp_opt_in
                             then v_now else whatsapp_opt_in_at end,
    ugc_consent          = coalesce(v_ugc_consent,          ugc_consent),
    ugc_consent_at       = case
                             when p_updates ? 'ugc_consent'
                              and v_ugc_consent is distinct from ugc_consent
                             then v_now else ugc_consent_at end,
    consent_source       = case
                             when (p_updates ? 'whatsapp_opt_in'
                                   and v_whatsapp_opt_in is distinct from whatsapp_opt_in)
                               or (p_updates ? 'ugc_consent'
                                   and v_ugc_consent is distinct from ugc_consent)
                             then v_consent_source else consent_source end,
    birthday_day         = case when p_updates ? 'birthday_day'   then v_birthday_day   else birthday_day   end,
    birthday_month       = case when p_updates ? 'birthday_month' then v_birthday_month else birthday_month end,
    updated_at           = v_now
  where id = v_customer.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function update_passport_preferences(uuid, text, jsonb) to anon;
grant execute on function update_passport_preferences(uuid, text, jsonb) to authenticated;

-- ── lookup_customer_by_passport_token (Phase 4 fn, refresh w/ consent fields) ──
create or replace function lookup_customer_by_passport_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer loyalty_customers%rowtype;
begin
  select * into v_customer
  from loyalty_customers
  where passport_token = p_token
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id',                  v_customer.id,
    'full_name',           v_customer.full_name,
    'phone',               v_customer.phone,
    'tier',                v_customer.tier,
    'current_stamps',      v_customer.current_stamps,
    'total_visits',        v_customer.total_visits,
    'nochi_state',         v_customer.nochi_state,
    'passport_token',      v_customer.passport_token,
    'referral_code',       v_customer.referral_code,
    'favorite_drinks',     to_jsonb(coalesce(v_customer.favorite_drinks, '{}'::text[])),
    'favorite_other',      v_customer.favorite_other,
    'milk_preference',     v_customer.milk_preference,
    'sweetness_preference',v_customer.sweetness_preference,
    'instagram_handle',    v_customer.instagram_handle,
    'tiktok_handle',       v_customer.tiktok_handle,
    'facebook_handle',     v_customer.facebook_handle,
    'whatsapp_opt_in',     v_customer.whatsapp_opt_in,
    'ugc_consent',         v_customer.ugc_consent,
    'birthday_day',        v_customer.birthday_day,
    'birthday_month',      v_customer.birthday_month
  );
end;
$$;

grant execute on function lookup_customer_by_passport_token(uuid) to authenticated;
grant execute on function lookup_customer_by_passport_token(uuid) to service_role;

notify pgrst, 'reload schema';
