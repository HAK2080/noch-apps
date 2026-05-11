-- set_my_pin — self-service PIN update.
-- Any authenticated user can update their OWN PIN (auth.uid() = p_user_id).
-- Owners can still use set_pos_pin to update other staff's PINs.
-- This unblocks the "My Profile" page for non-owner staff.

create extension if not exists pgcrypto;

create or replace function public.set_my_pin(
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salt text;
  v_hash text;
begin
  -- Validate PIN format: 4–6 digits only
  if p_new_pin is null or p_new_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4–6 digits';
  end if;

  -- Generate a fresh per-user salt and hash
  v_salt := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(p_new_pin || v_salt, 'sha256'), 'hex');

  -- Only allow updating your own PIN
  update profiles
    set pin_code       = v_hash,
        pin_salt       = v_salt,
        pin_updated_at = now()
    where id = auth.uid();

  return jsonb_build_object('ok', true);
end;
$$;

-- Grant to all authenticated users (they can only touch their own row)
grant execute on function public.set_my_pin(text) to authenticated;
