-- Migration: Telegram reminders + webhook reply-to-comment support
-- 1. Add telegram_chat_id to task_reminders (replaces phone for Telegram delivery)
-- 2. Track sent Telegram message IDs so replies can be linked back to tasks
-- 3. Add source column to task_comments to mark comments that came from Telegram

-- ── task_reminders: add telegram_chat_id ──────────────────────────────────────
alter table task_reminders
  add column if not exists telegram_chat_id text;

-- ── telegram_messages: maps Telegram message_id → task ───────────────────────
create table if not exists telegram_messages (
  id          uuid        primary key default gen_random_uuid(),
  task_id     uuid        not null references tasks(id) on delete cascade,
  reminder_id uuid        references task_reminders(id) on delete set null,
  chat_id     text        not null,
  message_id  bigint      not null,
  created_at  timestamptz not null default now(),
  unique (chat_id, message_id)
);

-- Allow service role full access (called from edge functions)
alter table telegram_messages enable row level security;
create policy "service_all" on telegram_messages
  using (true) with check (true);

-- ── task_comments: add source column ─────────────────────────────────────────
alter table task_comments
  add column if not exists source text not null default 'app'
  check (source in ('app', 'telegram'));

-- author_id is already nullable (on delete set null) — no change needed
