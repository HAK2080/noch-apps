-- Fix set_pos_pin to use extensions.gen_random_bytes() and extensions.digest().
-- Supabase installs pgcrypto in the extensions schema, not public.
-- search_path = public hides it, so schema-qualified calls are required.

CREATE OR REPLACE FUNCTION public.set_pos_pin(p_user_id uuid, p_new_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role text;
  v_salt text;
  v_hash text;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'only owners can set staff PINs';
  END IF;
  IF p_new_pin !~ '^\d{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4–6 digits';
  END IF;
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');
  v_hash := encode(extensions.digest(p_new_pin || v_salt, 'sha256'), 'hex');
  UPDATE profiles SET pin_code = v_hash, pin_salt = v_salt, pin_updated_at = now() WHERE id = p_user_id;
  INSERT INTO pos_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'pin_changed', 'profiles', p_user_id, jsonb_build_object('by', auth.uid()));
  RETURN jsonb_build_object('ok', true);
END;
$$;
