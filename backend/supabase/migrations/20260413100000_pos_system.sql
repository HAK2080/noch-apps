-- POS System Tables

-- Branches
create table if not exists pos_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  location text,
  phone text,
  currency text default 'LYD',
  receipt_header text,
  receipt_footer text default 'شكراً لزيارتكم',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Categories (per branch)
create table if not exists pos_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references pos_branches(id) on delete cascade,
  name text not null,
  name_ar text,
  color text default '#10b981',
  sort_order int default 0,
  is_active boolean default true
);

-- Products (per branch)
create table if not exists pos_products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references pos_branches(id) on delete cascade,
  category_id uuid references pos_categories(id) on delete set null,
  name text not null,
  name_ar text,
  price decimal(10,3) not null default 0,
  barcode text,
  sku text,
  description text,
  is_active boolean default true,
  track_inventory boolean default false,
  stock_qty decimal(10,2) default 0,
  low_stock_alert decimal(10,2) default 5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shifts
create table if not exists pos_shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references pos_branches(id),
  opened_at timestamptz default now(),
  closed_at timestamptz,
  opening_cash decimal(10,3) default 0,
  closing_cash decimal(10,3),
  expected_cash decimal(10,3) default 0,
  cash_difference decimal(10,3),
  total_cash_sales decimal(10,3) default 0,
  total_card_sales decimal(10,3) default 0,
  total_sales decimal(10,3) default 0,
  total_orders int default 0,
  total_discounts decimal(10,3) default 0,
  notes text,
  status text default 'open',
  created_by uuid references profiles(id)
);

-- Orders
create table if not exists pos_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references pos_branches(id),
  shift_id uuid references pos_shifts(id),
  order_number text not null,
  subtotal decimal(10,3) not null default 0,
  discount_amount decimal(10,3) default 0,
  discount_pct decimal(5,2) default 0,
  total decimal(10,3) not null default 0,
  payment_method text not null default 'cash',
  cash_tendered decimal(10,3),
  change_due decimal(10,3) default 0,
  card_amount decimal(10,3) default 0,
  loyalty_customer_id uuid,
  loyalty_stamps_awarded int default 0,
  status text default 'completed',
  voided_at timestamptz,
  void_reason text,
  synced boolean default true,
  created_at timestamptz default now()
);

-- Order Items
create table if not exists pos_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_orders(id) on delete cascade,
  product_id uuid references pos_products(id),
  product_name text not null,
  product_name_ar text,
  unit_price decimal(10,3) not null,
  quantity int not null default 1,
  total decimal(10,3) not null,
  notes text
);

-- Inventory Movements
create table if not exists pos_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references pos_branches(id),
  product_id uuid not null references pos_products(id),
  movement_type text not null,
  quantity decimal(10,2) not null,
  stock_before decimal(10,2),
  stock_after decimal(10,2),
  reference_id uuid,
  notes text,
  created_at timestamptz default now()
);

-- RLS: enable and allow authenticated users full access (single tenant app)
alter table pos_branches enable row level security;
alter table pos_categories enable row level security;
alter table pos_products enable row level security;
alter table pos_shifts enable row level security;
alter table pos_orders enable row level security;
alter table pos_order_items enable row level security;
alter table pos_inventory_movements enable row level security;

create policy "pos_all" on pos_branches for all to authenticated using (true) with check (true);
create policy "pos_all" on pos_categories for all to authenticated using (true) with check (true);
create policy "pos_all" on pos_products for all to authenticated using (true) with check (true);
create policy "pos_all" on pos_shifts for all to authenticated using (true) with check (true);
create policy "pos_all" on pos_orders for all to authenticated using (true) with check (true);
create policy "pos_all" on pos_order_items for all to authenticated using (true) with check (true);
create policy "pos_all" on pos_inventory_movements for all to authenticated using (true) with check (true);

-- Seed the 3 branches
insert into pos_branches (name, name_ar, location, receipt_header) values
  ('Noch Hay Alandlous', 'نوتش حي الأندلس', 'حي الأندلس، طرابلس', 'NOCH CAFÉ - حي الأندلس'),
  ('Noch Jaraba', 'نوتش جرابة', 'جرابة، طرابلس', 'NOCH CAFÉ - جرابة'),
  ('Bloom Abu Nawas', 'بلوم أبو نواس', 'أبو نواس، طرابلس', 'BLOOM COFFEE - أبو نواس')
on conflict do nothing;
