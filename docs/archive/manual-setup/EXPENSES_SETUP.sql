-- ============================================================
-- EXPENSES MODULE — Run this in Supabase SQL Editor
-- ============================================================

-- 1. Cost Centers
create table if not exists cost_centers (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  name text not null,
  active boolean default true,
  advisory_budget numeric default 0,
  created_at timestamptz default now()
);

insert into cost_centers (code, name) values
  ('CC00', 'CEO (HAK)'),
  ('CC01', 'Noch City Walk'),
  ('CC02', 'Noch Galaria Mall'),
  ('CC03', 'Bloom Abu Nawas'),
  ('CC99', 'MD (Ahmed Kashada)')
on conflict (code) do nothing;

-- 2. Expense Categories
create table if not exists expense_categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  icon text default '📋',
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

insert into expense_categories (name, icon, sort_order) values
  ('Construction / Renovation', '🏗️', 1),
  ('Equipment & Furniture', '🪑', 2),
  ('Supplies & Consumables', '📦', 3),
  ('Marketing & Branding', '📢', 4),
  ('Utilities', '⚡', 5),
  ('Petty Cash', '💵', 6),
  ('Labor / Contractors', '👷', 7),
  ('Professional Services', '⚖️', 8),
  ('Rent & Deposits', '🏠', 9),
  ('Transport & Delivery', '🚚', 10),
  ('Other', '📋', 99)
on conflict do nothing;

-- 3. Module-local Exchange Rates (independent from global currency_rates)
create table if not exists cc_exchange_rates (
  currency text primary key,
  rate_to_lyd numeric not null default 1,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id)
);

insert into cc_exchange_rates (currency, rate_to_lyd) values
  ('LYD', 1),
  ('USD', 5.50),
  ('EUR', 6.00),
  ('GBP', 7.00),
  ('SAR', 1.47),
  ('AED', 1.50),
  ('TRY', 0.17),
  ('EGP', 0.11)
on conflict (currency) do nothing;

-- 4. Expenses
create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  submitted_by uuid references profiles(id) not null,
  cost_center_id uuid references cost_centers(id) not null,
  category_id uuid references expense_categories(id) not null,
  amount numeric not null,
  currency text default 'LYD',
  exchange_rate_to_lyd numeric default 1,
  amount_lyd numeric not null,
  vendor text,
  description text,
  receipt_url text,
  expense_date date not null default current_date,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  submitted_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Expense Approvals / Actions
create table if not exists expense_approvals (
  id uuid default gen_random_uuid() primary key,
  expense_id uuid references expenses(id) on delete cascade not null,
  acted_by uuid references profiles(id) not null,
  acted_at timestamptz default now(),
  decision text not null check (decision in ('approved', 'rejected', 'paid', 'auto_approved')),
  notes text
);

-- 6. Owner Settings (for auto-approve toggle etc.)
create table if not exists owner_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

-- 7. RLS — simple: authenticated users can read/write, app handles auth logic
alter table cost_centers enable row level security;
alter table expense_categories enable row level security;
alter table cc_exchange_rates enable row level security;
alter table expenses enable row level security;
alter table expense_approvals enable row level security;
alter table owner_settings enable row level security;

create policy "auth_read_cost_centers" on cost_centers for select to authenticated using (true);
create policy "auth_write_cost_centers" on cost_centers for all to authenticated using (true) with check (true);

create policy "auth_read_expense_categories" on expense_categories for select to authenticated using (true);
create policy "auth_write_expense_categories" on expense_categories for all to authenticated using (true) with check (true);

create policy "auth_read_cc_exchange_rates" on cc_exchange_rates for select to authenticated using (true);
create policy "auth_write_cc_exchange_rates" on cc_exchange_rates for all to authenticated using (true) with check (true);

create policy "auth_read_expenses" on expenses for select to authenticated using (true);
create policy "auth_insert_expenses" on expenses for insert to authenticated with check (auth.uid() = submitted_by);
create policy "auth_update_expenses" on expenses for update to authenticated using (true);

create policy "auth_read_expense_approvals" on expense_approvals for select to authenticated using (true);
create policy "auth_insert_expense_approvals" on expense_approvals for insert to authenticated with check (true);

create policy "auth_read_owner_settings" on owner_settings for select to authenticated using (true);
create policy "auth_write_owner_settings" on owner_settings for all to authenticated using (true) with check (true);

-- 8. Create Supabase Storage bucket manually in Dashboard:
--    Bucket name: expense-receipts
--    Public: true (so receipt URLs are directly accessible)
--    Or: Set up signed URL policy if you want private receipts

-- Done! Run this, then create the storage bucket, then deploy the frontend.
