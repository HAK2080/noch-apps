-- Physical inventory locations are required by the central warehouse model.
-- Older repositories defined this table in an unapplied June migration, so
-- create it here idempotently before the July warehouse migrations run.

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.pos_branches(id) on delete set null,
  name text not null,
  name_ar text,
  location_type text not null default 'storage'
    check (location_type in ('warehouse','branch','fridge','freezer','shelf','storage','other')),
  address text,
  notes text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists inventory_locations_branch_idx
  on public.inventory_locations(branch_id);

alter table public.inventory_locations enable row level security;

drop policy if exists "inventory_locations_read" on public.inventory_locations;
create policy "inventory_locations_read" on public.inventory_locations
  for select to authenticated using (true);

drop policy if exists "inventory_locations_owner_insert" on public.inventory_locations;
create policy "inventory_locations_owner_insert" on public.inventory_locations
  for insert to authenticated
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'supervisor')
  ));

drop policy if exists "inventory_locations_owner_update" on public.inventory_locations;
create policy "inventory_locations_owner_update" on public.inventory_locations
  for update to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'supervisor')
  ))
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'supervisor')
  ));

drop policy if exists "inventory_locations_owner_delete" on public.inventory_locations;
create policy "inventory_locations_owner_delete" on public.inventory_locations
  for delete to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'supervisor')
  ));

grant select, insert, update, delete on public.inventory_locations to authenticated;
