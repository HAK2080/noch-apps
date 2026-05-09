-- ============================================================
-- NOCHI PASS — Phase 4: rewards + referral + staff-scan attach
-- - get_public_passport: include referral_code
-- - lookup_customer_by_passport_token(uuid): minimal row for the
--   POS to attach a customer fast when staff scans the QR shown
--   on the customer's Pass page
-- Re-runnable.
-- ============================================================

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
    'referral_code',        v_customer.referral_code,
    'pending_rewards',      v_pending
  );
end;
$$;

grant execute on function get_public_passport(uuid) to anon;
grant execute on function get_public_passport(uuid) to authenticated;

-- POS-side: scan the customer's on-screen Pass QR to attach them.
-- Auth-only: only signed-in staff can resolve a passport_token to a
-- minimal customer row. This is *not* exposed to anon.
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
    'id',              v_customer.id,
    'full_name',       v_customer.full_name,
    'phone',           v_customer.phone,
    'tier',            v_customer.tier,
    'current_stamps',  v_customer.current_stamps,
    'total_visits',    v_customer.total_visits,
    'nochi_state',     v_customer.nochi_state,
    'passport_token',  v_customer.passport_token,
    'referral_code',   v_customer.referral_code
  );
end;
$$;

grant execute on function lookup_customer_by_passport_token(uuid) to authenticated;
grant execute on function lookup_customer_by_passport_token(uuid) to service_role;

notify pgrst, 'reload schema';
