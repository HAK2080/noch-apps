-- 20260512030000_wipe_test_customers.sql
--
-- Pre-launch customer data wipe.
-- Removes all test customers and every row that belongs to them.
-- Staff (profiles table) and all operational config are untouched.
--
-- CASCADE map for loyalty_customers DELETE:
--   loyalty_stamps              ON DELETE CASCADE
--   loyalty_rewards             ON DELETE CASCADE
--   loyalty_feedback            ON DELETE CASCADE
--   loyalty_challenge_progress  ON DELETE CASCADE
--   loyalty_customer_badges     ON DELETE CASCADE
--   nochi_challenge_progress    ON DELETE CASCADE
--   customer_segments           ON DELETE CASCADE  (pk = customer_id)
--   customer_memory_summaries   ON DELETE CASCADE  (pk = customer_id)
--   ugc_submissions             ON DELETE CASCADE
--   marketing_campaign_recipients loyalty_customer_id → SET NULL (row kept)
--   whatsapp_sends              customer_id → SET NULL (row kept)
--
-- Additional tables cleared separately:
--   marketing_campaign_recipients — recipient rows are customer-specific
--   whatsapp_sends                — test sends to test numbers
--   loyalty_qr_tokens             — rotating tokens; fresh ones generated on use

BEGIN;

-- Main delete — cascade handles all child tables automatically
DELETE FROM loyalty_customers;

-- Recipient rows (campaign definitions themselves are kept)
DELETE FROM marketing_campaign_recipients;

-- Test WhatsApp sends
DELETE FROM whatsapp_sends;

-- Rotate QR token pool (will be regenerated when customers scan on launch day)
DELETE FROM loyalty_qr_tokens;

COMMIT;
