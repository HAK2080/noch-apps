-- Create task_assignments junction table for multi-assign support
create table if not exists task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  assignee_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (task_id, assignee_id)
);

-- Enable RLS
alter table task_assignments enable row level security;

-- Owner can view all assignments for their tasks
create policy "assignment_owner_select" on task_assignments for select to authenticated
  using (
    (select created_by from tasks where id = task_id) = auth.uid()
  );

-- Staff can view assignments for tasks they're assigned to
create policy "assignment_staff_select" on task_assignments for select to authenticated
  using (
    assignee_id = auth.uid()
    or (select created_by from tasks where id = task_id) = auth.uid()
  );

-- Only owner can insert assignments
create policy "assignment_insert" on task_assignments for insert to authenticated
  with check (
    (select created_by from tasks where id = task_id) = auth.uid()
  );

-- Only owner can update assignments
create policy "assignment_update" on task_assignments for update to authenticated
  using (
    (select created_by from tasks where id = task_id) = auth.uid()
  );

-- Only owner can delete assignments
create policy "assignment_delete" on task_assignments for delete to authenticated
  using (
    (select created_by from tasks where id = task_id) = auth.uid()
  );

-- Add visible_to column to task_comments for reply visibility control
alter table task_comments
add column if not exists visible_to uuid[] default null;

comment on column task_comments.visible_to is 'Array of user IDs who can see this comment. If null, comment is visible to all. Used for Telegram replies visibility.';

-- Update RLS policy for task_comments to check visible_to
-- First, drop the old select policy if it exists
drop policy if exists "task_comments_select" on task_comments;

-- Create new select policy that checks visible_to
create policy "task_comments_select" on task_comments for select to authenticated
  using (
    (select created_by from tasks where id = task_id) = auth.uid()  -- owner sees all
    or (select assigned_to from tasks where id = task_id) = auth.uid()  -- primary assignee sees all
    or (visible_to is null)  -- all comments visible_to = null are public
    or (auth.uid() = any(visible_to))  -- user is in visible_to array
  );

-- RPC function to get user's tasks (assigned_to OR in task_assignments)
create or replace function get_user_tasks(user_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  assigned_to uuid,
  created_by uuid,
  status text,
  priority text,
  due_date date,
  is_group boolean,
  has_attachments boolean,
  completed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  assignee json,
  assignees json
) as $$
select
  t.id,
  t.title,
  t.description,
  t.assigned_to,
  t.created_by,
  t.status,
  t.priority,
  t.due_date,
  t.is_group,
  t.has_attachments,
  t.completed_at,
  t.reminder_sent_at,
  t.created_at,
  t.updated_at,
  row_to_json(p.*) as assignee,
  coalesce(
    json_agg(
      json_build_object(
        'id', ta.id,
        'assignee_id', ta.assignee_id,
        'assigned_by', ta.assigned_by,
        'assigned_at', ta.assigned_at,
        'assignee', row_to_json(ap.*)
      )
    ) filter (where ta.id is not null),
    '[]'::json
  ) as assignees
from tasks t
left join profiles p on t.assigned_to = p.id
left join task_assignments ta on t.id = ta.task_id
left join profiles ap on ta.assignee_id = ap.id
where (t.assigned_to = user_id or ta.assignee_id = user_id)
  and t.status != 'done'
group by t.id, t.title, t.description, t.assigned_to, t.created_by, t.status, t.priority, t.due_date, t.is_group, t.has_attachments, t.completed_at, t.reminder_sent_at, t.created_at, t.updated_at, p.id, p.full_name, p.role, p.phone, p.telegram_chat_id, p.created_at, p.updated_at
order by t.due_date asc nulls last
$$ language sql stable;

