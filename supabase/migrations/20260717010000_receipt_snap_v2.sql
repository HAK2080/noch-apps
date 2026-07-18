-- ============================================================
-- RECEIPT SNAP v2 — free extraction + manual entries
-- Run in Supabase SQL Editor (after 20260717000000_receipt_snap.sql)
-- ============================================================

-- 1. Allow amount = 0 (means: unreadable, office fills at review)
alter table expenses drop constraint if exists expenses_amount_check;
alter table expenses add constraint expenses_amount_check check (amount >= 0);

-- 2. New snap state: bot asked staff to type the amount
alter table expense_snaps drop constraint if exists expense_snaps_status_check;
alter table expense_snaps add constraint expense_snaps_status_check
  check (status in ('awaiting_branch', 'awaiting_amount', 'awaiting_custom',
                    'completed', 'failed', 'cancelled'));

-- 3. Manual (typed) expenses have no photo
alter table expense_snaps alter column receipt_url drop not null;
