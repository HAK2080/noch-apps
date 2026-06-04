-- Multi-tablet print queue
-- Lets multiple tablets enqueue receipts; one "host" tablet (the one
-- with the Bluetooth printer paired) subscribes via Realtime and prints.

CREATE TABLE IF NOT EXISTS pos_print_queue (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  branch_id uuid REFERENCES pos_branches(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('receipt', 'drink_ticket', 'test')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'done', 'failed')),
  host_device_id text,
  error text,
  enqueued_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS pos_print_queue_branch_status_idx
  ON pos_print_queue (branch_id, status, created_at);

-- RLS
ALTER TABLE pos_print_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read print queue" ON pos_print_queue;
CREATE POLICY "auth read print queue" ON pos_print_queue
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert print queue" ON pos_print_queue;
CREATE POLICY "auth insert print queue" ON pos_print_queue
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth update print queue" ON pos_print_queue;
CREATE POLICY "auth update print queue" ON pos_print_queue
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Atomic claim: SKIP LOCKED ensures only one host wins if two are racing
CREATE OR REPLACE FUNCTION claim_print_jobs(
  p_branch_id uuid,
  p_host_device_id text,
  p_limit int DEFAULT 5
)
RETURNS SETOF pos_print_queue
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE pos_print_queue q
  SET status = 'printing',
      host_device_id = p_host_device_id,
      updated_at = now()
  WHERE q.id IN (
    SELECT id FROM pos_print_queue
    WHERE branch_id = p_branch_id AND status = 'pending'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.*;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_print_jobs TO authenticated;

-- Auto-cleanup: delete completed jobs older than 24h to keep the table light
CREATE OR REPLACE FUNCTION cleanup_print_queue()
RETURNS void
LANGUAGE sql AS $$
  DELETE FROM pos_print_queue
  WHERE status IN ('done', 'failed')
    AND completed_at < now() - interval '24 hours';
$$;

GRANT EXECUTE ON FUNCTION cleanup_print_queue TO authenticated;

-- Realtime: enable change events for this table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pos_print_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pos_print_queue;
  END IF;
END $$;
