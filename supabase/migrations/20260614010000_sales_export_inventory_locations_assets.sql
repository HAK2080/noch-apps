-- Noch Cafe V2: analysis exports, inventory locations, and fixed assets.

-- Warehouses / storage locations for counted stock by physical place.
create table if not exists inventory_locations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references pos_branches(id) on delete set null,
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

create table if not exists inventory_location_stock (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references inventory_locations(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  qty_available numeric(12,3) not null default 0,
  unit text,
  notes text,
  last_counted_at timestamptz,
  updated_at timestamptz default now(),
  unique (ingredient_id, location_id)
);

create index if not exists inventory_location_stock_ingredient_idx
  on inventory_location_stock(ingredient_id);
create index if not exists inventory_location_stock_location_idx
  on inventory_location_stock(location_id);

alter table inventory_locations enable row level security;
alter table inventory_location_stock enable row level security;

drop policy if exists "inventory_locations_staff_read_owner_write" on inventory_locations;
create policy "inventory_locations_staff_read_owner_write" on inventory_locations
  for all to authenticated
  using (true)
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','supervisor')));

drop policy if exists "inventory_location_stock_staff_read_owner_write" on inventory_location_stock;
create policy "inventory_location_stock_staff_read_owner_write" on inventory_location_stock
  for all to authenticated
  using (true)
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','supervisor')));

-- Fixed-assets fields layered onto the existing finance_capex register.
alter table finance_capex
  add column if not exists asset_code text,
  add column if not exists category text,
  add column if not exists serial_number text,
  add column if not exists condition text default 'in_use'
    check (condition in ('in_use','needs_repair','stored','retired','sold')),
  add column if not exists salvage_value_lyd numeric(12,2) default 0,
  add column if not exists old_system_ref text,
  add column if not exists depreciation_method text default 'straight_line'
    check (depreciation_method in ('straight_line')),
  add column if not exists depreciation_start date,
  add column if not exists legacy_accumulated_depreciation_lyd numeric(12,2) default 0;

create unique index if not exists finance_capex_asset_code_uidx
  on finance_capex(asset_code)
  where asset_code is not null;
