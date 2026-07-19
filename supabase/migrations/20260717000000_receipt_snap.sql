-- ============================================================
-- NOCH 5.0 — RECEIPT SNAP (photo-only expense submission)
-- Staff submit a receipt photo (Telegram bot or PWA /snap),
-- AI extracts details, one tap picks the branch (or a split).
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Link split expense rows back to one receipt
alter table expenses add column if not exists receipt_group_id uuid;
create index if not exists idx_expenses_receipt_group on expenses(receipt_group_id);

-- Mark snap-originated rows so review can group them
alter table expenses add column if not exists source text default 'manual';

-- 2. Cost centers eligible for "split evenly" (exclude CEO/MD buckets)
-- NOTE: live cost_centers uses the code as its text primary key (id = 'CC01' etc.)
alter table cost_centers add column if not exists include_in_split boolean default true;
update cost_centers set include_in_split = false where id in ('CC00', 'CC99');

-- 3. Pending snap state (photo received, awaiting branch pick)
create table if not exists expense_snaps (
  id uuid default gen_random_uuid() primary key,
  submitted_by uuid references profiles(id) not null,
  source text not null check (source in ('telegram', 'pwa')),
  telegram_chat_id text,
  telegram_message_id text,
  receipt_url text not null,
  extracted jsonb default '{}'::jsonb,  -- {vendor, amount, currency, expense_date, category, branch_hint, confidence}
  status text default 'awaiting_branch'
    check (status in ('awaiting_branch', 'awaiting_custom', 'completed', 'failed', 'cancelled')),
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_expense_snaps_chat_status
  on expense_snaps(telegram_chat_id, status);

alter table expense_snaps enable row level security;

-- Edge functions use the service role (bypasses RLS).
-- Authenticated users may see their own snaps (PWA status/debug).
create policy "own_snaps_select" on expense_snaps
  for select to authenticated using (auth.uid() = submitted_by);

-- 4. Storage bucket for receipts (no-op if it already exists)
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', true)
on conflict (id) do nothing;

-- Done. Next: deploy edge functions (see RECEIPT_SNAP_SETUP.md).
