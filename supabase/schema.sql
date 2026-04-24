-- ============================================================
-- NOCH TASK MANAGER — SUPABASE SCHEMA
-- Run this in your Supabase SQL editor
-- ============================================================

-- Profiles (linked to auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  is_group boolean default false,
  has_attachments boolean default false,
  completed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Task attachments
create table if not exists task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text,
  created_at timestamptz default now()
);

-- Task comments
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

-- Report logs (for idempotent weekly reports)
create table if not exists report_logs (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  sent_at timestamptz default now(),
  recipient_phone text,
  summary jsonb
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table tasks enable row level security;
alter table task_attachments enable row level security;
alter table task_comments enable row level security;
alter table report_logs enable row level security;

-- Profiles: everyone authenticated can read
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update" on profiles for update to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner' or id = auth.uid());
create policy "profiles_delete" on profiles for delete to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner');

-- Tasks: owner sees all, staff sees their own
create policy "tasks_select" on tasks for select to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner' or assigned_to = auth.uid());
create policy "tasks_insert" on tasks for insert to authenticated
  with check ((select role from profiles where id = auth.uid()) = 'owner');
create policy "tasks_update" on tasks for update to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner' or assigned_to = auth.uid());
create policy "tasks_delete" on tasks for delete to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner');

-- Attachments
create policy "attachments_select" on task_attachments for select to authenticated using (true);
create policy "attachments_insert" on task_attachments for insert to authenticated with check (true);
create policy "attachments_delete" on task_attachments for delete to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner');

-- Comments
create policy "comments_select" on task_comments for select to authenticated using (true);
create policy "comments_insert" on task_comments for insert to authenticated with check (true);

-- Report logs: owner only
create policy "report_select" on report_logs for select to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner');
create policy "report_insert" on report_logs for insert to authenticated
  with check ((select role from profiles where id = auth.uid()) = 'owner');

-- ============================================================
-- TASK REMINDERS (scheduled WhatsApp reminders)
-- ============================================================

create table if not exists task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  phone text not null,
  frequency text not null check (frequency in ('daily', 'every2days', 'weekly', 'specific_date', 'custom')),
  interval_days integer,       -- used when frequency = 'custom'
  specific_date date,          -- used when frequency = 'specific_date'
  send_time text default '09:00', -- HH:MM time of day to send
  active boolean default true,
  next_send_at timestamptz,
  created_at timestamptz default now()
);

alter table task_reminders enable row level security;

create policy "reminders_select" on task_reminders for select to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner');
create policy "reminders_insert" on task_reminders for insert to authenticated
  with check ((select role from profiles where id = auth.uid()) = 'owner');
create policy "reminders_update" on task_reminders for update to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner');
create policy "reminders_delete" on task_reminders for delete to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner');

-- ============================================================
-- STORAGE BUCKET (run after creating the bucket in Supabase UI)
-- ============================================================
-- Create a bucket named "attachments" in Supabase Storage (public)
-- Then run:
-- insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true);

-- ============================================================
-- PG_CRON (run this to enable scheduled reminders)
-- Requires pg_cron extension enabled in Supabase Dashboard > Extensions
-- ============================================================
-- select cron.schedule(
--   'process-reminders-hourly',
--   '0 * * * *',
--   $$
--   select net.http_post(
--     url:='https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/process-reminders',
--     headers:='{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>"}'::jsonb,
--     body:='{}'::jsonb
--   ) as request_id;
--   $$
-- );
