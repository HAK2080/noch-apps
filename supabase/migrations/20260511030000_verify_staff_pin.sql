-- verify_staff_pin — verify a PIN against one specific staff member.
-- Called from the POS staff-picker screen after the staff member taps
-- their name. Only checks the one profile row, so duplicate PINs across
-- staff are never a problem.
--
-- Returns:
--   { matched: bool }                          — wrong PIN
--   { matched: bool, locked: bool, retry_in_seconds: int } — rate-limited
--   { matched: true, profile: {...} }           — success

create or replace function public.verify_staff_pin(
  p_profile_id uuid,
  p_pin        text,
  p_branch_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier  text;
  v_failures    int;
  v_oldest      timestamptz;
  v_profile     profiles;
  v_test_hash   text;
  v_lock_window interval := interval '15 minutes';
  v_threshold   int := 10;
begin
  if p_pin is null or p_pin !~ '^\d{4,6}$' then
    return jsonb_build_object('matched', false);
  end if;

  -- Rate-limit key: per-profile, not per-session, so brute force across
  -- different devices is also caught.
  v_identifier := coalesce(p_profile_id::text, 'anon');

  select count(*) filter (where not succeeded),
         min(attempted_at)
    into v_failures, v_oldest
    from pin_attempts
   where identifier = v_identifier
     and attempted_at > now() - v_lock_window;

  if v_failures >= v_threshold then
    return jsonb_build_object(
      'matched',           false,
      'locked',            true,
      'retry_in_seconds',  extract(epoch from (v_oldest + v_lock_window - now()))::int
    );
  end if;

  -- Load the specific staff member (must be active and have a PIN set)
  select * into v_profile
    from profiles
   where id = p_profile_id
     and is_active = true
     and pin_code is not null;

  if not found then
    return jsonb_build_object('matched', false);
  end if;

  -- Verify PIN (per-user salt; legacy static-salt fallback)
  if v_profile.pin_salt is not null then
    v_test_hash := encode(extensions.digest(p_pin || v_profile.pin_salt, 'sha256'), 'hex');
  else
    v_test_hash := encode(extensions.digest(p_pin || 'noch_salt_2026',   'sha256'), 'hex');
  end if;

  -- Record attempt
  insert into pin_attempts (identifier, branch_id, succeeded)
    values (v_identifier, p_branch_id, v_test_hash = v_profile.pin_code);

  if v_test_hash <> v_profile.pin_code then
    return jsonb_build_object('matched', false);
  end if;

  return jsonb_build_object(
    'matched', true,
    'profile', jsonb_build_object(
      'id',         v_profile.id,
      'full_name',  v_profile.full_name,
      'role',       v_profile.role,
      'photo_url',  v_profile.photo_url,
      'department', v_profile.department
    )
  );
end;
$$;

-- Accessible to all authenticated users (tablet logged in as nochi)
grant execute on function public.verify_staff_pin(uuid, text, uuid) to authenticated;
