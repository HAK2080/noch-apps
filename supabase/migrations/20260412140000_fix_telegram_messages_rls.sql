-- Migration: Fix telegram_messages RLS policies for webhook access
-- The previous policy was ambiguous. This makes it explicit.

-- Drop the old policy if it exists
drop policy if exists "service_all" on telegram_messages;

-- Create explicit policies for all operations
-- Telegram webhook needs to select and insert messages
-- Service role (used by edge functions) should have full access

-- For SELECT: allow all (service role bypasses RLS, but be explicit)
create policy "telegram_messages_select" on telegram_messages
  for select
  using (true);

-- For INSERT: allow all (webhook will insert)
create policy "telegram_messages_insert" on telegram_messages
  for insert
  with check (true);

-- For UPDATE: allow all
create policy "telegram_messages_update" on telegram_messages
  for update
  using (true)
  with check (true);

-- For DELETE: allow all (e.g., when task is deleted via cascade)
create policy "telegram_messages_delete" on telegram_messages
  for delete
  using (true);
