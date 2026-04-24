-- ============================================================
-- BLOOMLY SYNC — 2026-04-17
-- Adds external_id/source columns and sync log table
-- for Bloomly Odoo → Noch data pipeline
-- ============================================================

-- Allow deduplication of synced rows
ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';

ALTER TABLE operating_costs ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE operating_costs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';

-- Unique index so upsert never duplicates
CREATE UNIQUE INDEX IF NOT EXISTS sales_transactions_external_id_idx
  ON sales_transactions(external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operating_costs_external_id_idx
  ON operating_costs(external_id) WHERE external_id IS NOT NULL;

-- Track sync runs
CREATE TABLE IF NOT EXISTS bloom_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at TIMESTAMPTZ DEFAULT now(),
  orders_synced INT DEFAULT 0,
  bills_synced INT DEFAULT 0,
  payslips_synced INT DEFAULT 0,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  sync_from TIMESTAMPTZ,
  sync_to TIMESTAMPTZ
);

-- RLS: owner-only access
ALTER TABLE bloom_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bloom_sync_log_owner" ON bloom_sync_log
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'
  ));
