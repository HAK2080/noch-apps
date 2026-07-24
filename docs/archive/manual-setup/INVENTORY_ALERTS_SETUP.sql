-- ============================================================
-- INVENTORY ALERTS — Run in Supabase SQL Editor
-- ============================================================

-- 1. Consumption view: avg daily usage per ingredient from stock_logs
--    Uses last 30 days of 'usage' entries (negative qty_change = consumption)
CREATE OR REPLACE VIEW ingredient_consumption AS
SELECT
  ingredient_id,
  ABS(SUM(CASE WHEN qty_change < 0 THEN qty_change ELSE 0 END)) / 30.0 AS avg_daily_usage_30d,
  COUNT(CASE WHEN qty_change < 0 THEN 1 END)::int                        AS usage_events_30d,
  MAX(CASE WHEN qty_change < 0 THEN created_at END)                      AS last_usage_at
FROM stock_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND (type = 'usage' OR (type = 'adjustment' AND qty_change < 0))
GROUP BY ingredient_id;

-- 2. Per-user inventory alert preferences
CREATE TABLE IF NOT EXISTS inventory_alert_prefs (
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  in_app     BOOLEAN DEFAULT TRUE,
  telegram   BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_alert_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own prefs" ON inventory_alert_prefs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner reads all prefs" ON inventory_alert_prefs
  FOR SELECT TO authenticated USING (true); -- app filters by owner check

-- 3. Stock alert log (records when alerts were generated/sent)
CREATE TABLE IF NOT EXISTS stock_alert_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  flagged_count INT,
  sent_telegram BOOLEAN DEFAULT FALSE,
  summary      TEXT
);

ALTER TABLE stock_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read alert log" ON stock_alert_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert alert log" ON stock_alert_log FOR INSERT TO authenticated WITH CHECK (true);

-- Done. The consumption view is now queryable as:
--   SELECT * FROM ingredient_consumption WHERE ingredient_id = '...'
-- InventoryHub loads this alongside stock to compute real days-to-out.
