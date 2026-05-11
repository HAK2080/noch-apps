-- Fix verify_pos_pin to use extensions.digest() instead of digest().
-- Supabase installs pgcrypto in the extensions schema, not public,
-- so schema-qualified calls are required when search_path = public.

CREATE OR REPLACE FUNCTION public.verify_pos_pin(p_pin text, p_branch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier text;
  v_recent_failures int;
  v_oldest_recent timestamptz;
  v_profile profiles;
  v_matched_id uuid := null;
  v_test_hash text;
  v_lock_window interval := interval '15 minutes';
  v_window      interval := interval '5 minutes';
  v_threshold   int := 10;
BEGIN
  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  v_identifier := coalesce(auth.uid()::text, 'anon');

  SELECT count(*) FILTER (WHERE NOT succeeded), min(attempted_at)
    INTO v_recent_failures, v_oldest_recent
    FROM pin_attempts
    WHERE identifier = v_identifier
      AND attempted_at > now() - v_lock_window;

  IF v_recent_failures >= v_threshold THEN
    RETURN jsonb_build_object(
      'matched', false,
      'locked', true,
      'retry_in_seconds', extract(epoch FROM (v_oldest_recent + v_lock_window - now()))::int
    );
  END IF;

  FOR v_profile IN
    SELECT * FROM profiles
    WHERE pin_code IS NOT NULL AND is_active = true
  LOOP
    IF v_profile.pin_salt IS NOT NULL THEN
      v_test_hash := encode(extensions.digest(p_pin || v_profile.pin_salt, 'sha256'), 'hex');
    ELSE
      v_test_hash := encode(extensions.digest(p_pin || 'noch_salt_2026', 'sha256'), 'hex');
    END IF;
    IF v_test_hash = v_profile.pin_code THEN
      v_matched_id := v_profile.id;
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO pin_attempts (identifier, branch_id, succeeded)
    VALUES (v_identifier, p_branch_id, v_matched_id IS NOT NULL);

  IF v_matched_id IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'role', v_profile.role,
      'photo_url', v_profile.photo_url,
      'department', v_profile.department
    )
  );
END;
$$;
