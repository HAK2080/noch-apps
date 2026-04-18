-- supabase/migrations/20260414000000_ideas_module.sql

-- Categories
create table if not exists idea_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#10b981',
  icon text,
  sort_order int default 0,
  is_default boolean default false
);

-- Ideas
create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  category_id uuid references idea_categories(id) on delete set null,
  status text not null default 'raw',
  image_url text,
  link_url text,
  submitted_by uuid not null references profiles(id) on delete cascade,
  converted_task_id uuid references tasks(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: idea_categories
alter table idea_categories enable row level security;
create policy "categories_read" on idea_categories
  for select to authenticated using (true);
create policy "categories_write" on idea_categories
  for all to authenticated
  using ((select role from profiles where id = auth.uid()) = 'owner')
  with check ((select role from profiles where id = auth.uid()) = 'owner');

-- RLS: ideas
alter table ideas enable row level security;
create policy "ideas_select" on ideas
  for select to authenticated
  using (
    (select role from profiles where id = auth.uid()) = 'owner'
    or submitted_by = auth.uid()
  );
create policy "ideas_insert" on ideas
  for insert to authenticated
  with check (submitted_by = auth.uid());
create policy "ideas_update" on ideas
  for update to authenticated
  using (
    (select role from profiles where id = auth.uid()) = 'owner'
    or (submitted_by = auth.uid() and converted_task_id is null)
  )
  with check (
    (select role from profiles where id = auth.uid()) = 'owner'
    or (submitted_by = auth.uid() and converted_task_id is null)
  );
create policy "ideas_delete" on ideas
  for delete to authenticated
  using (
    (select role from profiles where id = auth.uid()) = 'owner'
    or (submitted_by = auth.uid() and converted_task_id is null)
  );

-- Seed default categories
insert into idea_categories (name, color, icon, sort_order, is_default) values
  ('Business Idea', '#3b82f6', '💼', 1, true),
  ('App Feature',   '#8b5cf6', '⚡', 2, true),
  ('Recipe / Drink','#10b981', '🍵', 3, true),
  ('Decoration',    '#f59e0b', '🎨', 4, true),
  ('Supplier',      '#6b7280', '📦', 5, true),
  ('Content',       '#ec4899', '📝', 6, true),
  ('Other',         '#64748b', '✨', 7, true)
on conflict do nothing;
