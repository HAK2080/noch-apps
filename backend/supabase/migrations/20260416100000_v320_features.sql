-- V3.2.0 Feature Migrations

-- Feature 1: Task Approval Flow
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pending_status text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_note text;
CREATE INDEX IF NOT EXISTS idx_tasks_pending_status ON tasks(pending_status) WHERE pending_status IS NOT NULL;

-- Feature 2: Table Ordering
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS table_number text;
ALTER TABLE pos_branches ADD COLUMN IF NOT EXISTS tables_count integer DEFAULT 0;

-- Feature 3: Vestaboard Messages
CREATE TABLE IF NOT EXISTS vestaboard_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL CHECK (char_length(message) <= 132),
  submitted_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, sent, rejected
  rejection_note text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE vestaboard_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vb_select" ON vestaboard_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "vb_insert" ON vestaboard_messages FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "vb_update" ON vestaboard_messages FOR UPDATE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'owner');

-- Feature 4: Google Maps Review Nudge
ALTER TABLE pos_branches ADD COLUMN IF NOT EXISTS google_maps_url text;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;

NOTIFY pgrst, 'reload schema';
