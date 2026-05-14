-- ════════════════════════════════════════════════════════════════════
-- Live data protection: daily snapshots + hard-delete block
-- ════════════════════════════════════════════════════════════════════
-- Protects against accidental wipes of menu and sales data:
--   1. Daily snapshot of critical tables into _archive tables
--   2. Hard DELETE blocked on protected tables (force soft-delete)
--   3. 30-day rolling retention on archives
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Archive tables ──────────────────────────────────────────────
-- Same shape as source + snapshot_date for time-travel queries.
-- Using "LIKE ... INCLUDING ALL" is too aggressive (copies constraints).
-- We just need the columns + a snapshot date.

CREATE TABLE IF NOT EXISTS pos_orders_archive (
  snapshot_date date NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  LIKE pos_orders
);
CREATE INDEX IF NOT EXISTS idx_pos_orders_archive_date ON pos_orders_archive(snapshot_date);

CREATE TABLE IF NOT EXISTS pos_order_items_archive (
  snapshot_date date NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  LIKE pos_order_items
);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_archive_date ON pos_order_items_archive(snapshot_date);

CREATE TABLE IF NOT EXISTS pos_products_archive (
  snapshot_date date NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  LIKE pos_products
);
CREATE INDEX IF NOT EXISTS idx_pos_products_archive_date ON pos_products_archive(snapshot_date);

CREATE TABLE IF NOT EXISTS pos_categories_archive (
  snapshot_date date NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  LIKE pos_categories
);
CREATE INDEX IF NOT EXISTS idx_pos_categories_archive_date ON pos_categories_archive(snapshot_date);

CREATE TABLE IF NOT EXISTS loyalty_customers_archive (
  snapshot_date date NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  LIKE loyalty_customers
);
CREATE INDEX IF NOT EXISTS idx_loyalty_customers_archive_date ON loyalty_customers_archive(snapshot_date);

-- ─── 2. Snapshot function ───────────────────────────────────────────
-- Inserts current rows of each protected table into its _archive table
-- with today's date. Idempotent for same date (replaces).

CREATE OR REPLACE FUNCTION take_daily_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date date := CURRENT_DATE;
  v_orders int;
  v_order_items int;
  v_products int;
  v_categories int;
  v_customers int;
BEGIN
  -- Replace today's snapshot if it exists
  DELETE FROM pos_orders_archive WHERE snapshot_date = v_date;
  DELETE FROM pos_order_items_archive WHERE snapshot_date = v_date;
  DELETE FROM pos_products_archive WHERE snapshot_date = v_date;
  DELETE FROM pos_categories_archive WHERE snapshot_date = v_date;
  DELETE FROM loyalty_customers_archive WHERE snapshot_date = v_date;

  INSERT INTO pos_orders_archive SELECT v_date, now(), p.* FROM pos_orders p;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  INSERT INTO pos_order_items_archive SELECT v_date, now(), p.* FROM pos_order_items p;
  GET DIAGNOSTICS v_order_items = ROW_COUNT;

  INSERT INTO pos_products_archive SELECT v_date, now(), p.* FROM pos_products p;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  INSERT INTO pos_categories_archive SELECT v_date, now(), p.* FROM pos_categories p;
  GET DIAGNOSTICS v_categories = ROW_COUNT;

  INSERT INTO loyalty_customers_archive SELECT v_date, now(), p.* FROM loyalty_customers p;
  GET DIAGNOSTICS v_customers = ROW_COUNT;

  -- Drop snapshots older than 30 days
  DELETE FROM pos_orders_archive       WHERE snapshot_date < v_date - INTERVAL '30 days';
  DELETE FROM pos_order_items_archive  WHERE snapshot_date < v_date - INTERVAL '30 days';
  DELETE FROM pos_products_archive     WHERE snapshot_date < v_date - INTERVAL '30 days';
  DELETE FROM pos_categories_archive   WHERE snapshot_date < v_date - INTERVAL '30 days';
  DELETE FROM loyalty_customers_archive WHERE snapshot_date < v_date - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'snapshot_date', v_date,
    'orders', v_orders,
    'order_items', v_order_items,
    'products', v_products,
    'categories', v_categories,
    'customers', v_customers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION take_daily_snapshot() TO authenticated, service_role;

-- ─── 3. Schedule daily at 3am UTC via pg_cron ───────────────────────
-- Supabase exposes pg_cron via the `cron` schema in `extensions`.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Drop any prior schedule with this name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('noch-daily-snapshot');
EXCEPTION WHEN OTHERS THEN
  -- function may not exist yet on first run / cron not set up
  NULL;
END $$;

SELECT cron.schedule(
  'noch-daily-snapshot',
  '0 3 * * *',                          -- 03:00 UTC daily (≈ 05:00 Libya)
  $$ SELECT take_daily_snapshot(); $$
);

-- Take an immediate first snapshot so we have a baseline NOW.
SELECT take_daily_snapshot();

-- ─── 4. Block hard DELETE on protected tables ───────────────────────
-- Use a trigger that raises an exception unless an explicit override
-- is set via SET LOCAL app.allow_hard_delete = 'on' inside a migration.

CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_hard_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'Hard DELETE blocked on %. Use soft-delete (is_active=false) instead. '
    'To override in a migration: SET LOCAL app.allow_hard_delete = ''on'';',
    TG_TABLE_NAME;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pos_orders', 'pos_products', 'pos_categories', 'loyalty_customers']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_hard_delete_trg ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER prevent_hard_delete_trg BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete()',
      t
    );
  END LOOP;
END $$;

-- Note: pos_order_items intentionally NOT in the list — voided/refunded
-- orders need to recompute item-level records and that flow already uses
-- soft-state via refunded_qty. Add it here if you want stricter coverage.
