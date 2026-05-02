-- Suppliers table — was in the original 20260417_big_build.sql but never
-- applied to the remote DB. Idempotent: safe to run repeatedly.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  website text,
  category text,
  notes text,
  created_at timestamptz default now()
);

-- Add the FK column to ingredients if missing (also from drifted migration)
alter table public.ingredients
  add column if not exists supplier_id uuid references public.suppliers(id);

-- RLS — authenticated read, owner write (matches 20260501010000)
alter table public.suppliers enable row level security;
drop policy if exists "sup_owner_write" on public.suppliers;
drop policy if exists "sup_auth_read"   on public.suppliers;
create policy "sup_owner_write" on public.suppliers
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
create policy "sup_auth_read" on public.suppliers
  for select to authenticated using (true);
