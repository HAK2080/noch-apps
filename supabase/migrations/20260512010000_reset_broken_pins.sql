-- 20260512010000_reset_broken_pins.sql
--
-- Fixes PINs that were stored by the old set_pos_pin (before the
-- extensions.digest() fix in 20260511040000).
--
-- The old function called gen_random_bytes() and digest() without the
-- extensions. prefix. On Supabase, pgcrypto lives in the extensions schema,
-- not public, so those calls likely errored silently and left pin_code/pin_salt
-- in an inconsistent state for any staff whose PIN was set before 2026-05-11.
--
-- Actions:
--   1. Purge old pin_attempts rows (removes any 15-min lockouts).
--   2. Reset محمد عبد العظيم's PIN to 2080 using the correct hashing path.
--   3. Null-out pin_code for any active staff whose pin_salt IS NULL but
--      pin_code IS NOT NULL (legacy static-salt rows).  Those staff need to
--      re-set their PIN via My Profile — leaving a possibly-broken hash is
--      worse than showing "no PIN set yet".
--      NOTE: comment this block out if you prefer to keep legacy staff PINs
--      working via the static-salt fallback in verify_staff_pin.

-- ── 1. Clear all pin attempt history (removes lockouts) ─────────────────────
DELETE FROM pin_attempts;

-- ── 2. Reset محمد عبد العظيم's PIN to 2080 ──────────────────────────────────
DO $$
DECLARE
  v_salt text;
  v_hash text;
  v_count int;
BEGIN
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');
  v_hash := encode(extensions.digest('2080' || v_salt, 'sha256'), 'hex');

  UPDATE profiles
     SET pin_code       = v_hash,
         pin_salt       = v_salt,
         pin_updated_at = now()
   WHERE full_name = 'محمد عبد العظيم'
     AND is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'reset_broken_pins: updated % row(s) for محمد عبد العظيم', v_count;
END;
$$;

-- ── 3. (Optional) Purge legacy static-salt hashes ───────────────────────────
-- These were stored as SHA256(pin || 'noch_salt_2026') and the verify_staff_pin
-- RPC still supports this fallback, so they should still work.
-- Uncomment the block below ONLY if you want to force all legacy staff to
-- re-set their PIN via My Profile.
--
-- UPDATE profiles
--    SET pin_code = NULL, pin_salt = NULL, pin_updated_at = now()
--  WHERE pin_salt IS NULL
--    AND pin_code IS NOT NULL
--    AND is_active = true;
