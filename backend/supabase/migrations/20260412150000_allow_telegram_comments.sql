-- Migration: Allow webhook to insert Telegram comments with null author_id
-- Telegram replies can come from users not in the system, so author_id may be null

-- Drop existing policies that block null author_id
drop policy if exists "comment_insert" on task_comments;

-- New policy: allow inserts for Telegram comments with service role
-- Service role (webhook) can insert comments with any author_id (including null)
create policy "comment_insert_telegram" on task_comments
  for insert
  to authenticated, service_role
  with check (true);

-- Keep existing select/update/delete policies working as before
-- (they should remain unchanged from initial migration)
