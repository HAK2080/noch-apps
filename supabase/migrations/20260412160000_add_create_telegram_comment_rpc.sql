-- Migration: Create RPC function for webhook to insert Telegram comments
-- This bypasses RLS restrictions on direct inserts

create or replace function create_telegram_comment(
  p_task_id uuid,
  p_author_id uuid,
  p_body text,
  p_source text
)
returns json
language plpgsql
security definer
as $$
declare
  v_comment_id uuid;
begin
  insert into task_comments (task_id, author_id, body, source)
  values (p_task_id, p_author_id, p_body, p_source)
  returning id into v_comment_id;

  return json_build_object('id', v_comment_id, 'success', true);
exception when others then
  return json_build_object('error', SQLERRM, 'success', false);
end;
$$;

-- Grant execute to anon and service_role (so webhook can call it)
grant execute on function create_telegram_comment to anon, service_role;
