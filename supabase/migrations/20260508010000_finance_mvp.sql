-- Finance MVP (2026-05-08).
-- Per docs/finance/01-mvp-plan.md.
-- Pure additions; no destructive changes. Safe to apply on live before
-- the client ships.

-- ──────────────────────────────────────────────────────────────────────
-- 1. finance_settings (singleton)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists finance_settings (
  id text primary key default 'default'
    check (id = 'default'),
  -- target bands for the threshold badges
  food_cost_min_pct numeric(5,2) default 28.00,
  food_cost_max_pct numeric(5,2) default 32.00,
  labor_cost_min_pct numeric(5,2) default 25.00,
  labor_cost_max_pct numeric(5,2) default 30.00,
  prime_cost_min_pct numeric(5,2) default 55.00,
  prime_cost_max_pct numeric(5,2) default 65.00,
  runway_warn_weeks numeric(4,1) default 8.0,
  -- monthly fixed-OpEx defaults (avoid manual entry every month)
  monthly_rent_lyd numeric(10,2) default 0,
  monthly_utilities_lyd numeric(10,2) default 0,
  monthly_other_fixed_lyd numeric(10,2) default 0,
  -- USD reference rate (manual, monthly) — display-only, NOT for ledger conversion
  usd_reference_rate_lyd numeric(8,4),
  usd_reference_rate_set_at date,
  -- cash on hand snapshot (manual; bank import is separate)
  cash_on_hand_lyd numeric(12,2) default 0,
  cash_on_hand_set_at timestamptz,
  updated_at timestamptz default now()
);
insert into finance_settings (id) values ('default') on conflict do nothing;

alter table finance_settings enable row level security;
create policy "finance_settings_owner_only" on finance_settings
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ──────────────────────────────────────────────────────────────────────
-- 2. Shift / labor log
--    pos_shift_attendees already has clock_in/out; add wage data.
-- ──────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists hourly_rate_lyd numeric(8,2);

alter table pos_shift_attendees
  add column if not exists hourly_rate_override_lyd numeric(8,2);

-- View: hours × rate per attendee per shift, capped at "now" for open shifts.
create or replace view shift_labor_cost as
select
  a.id                            as attendee_id,
  a.shift_id,
  a.user_id,
  a.branch_id,
  a.clocked_in_at,
  a.clocked_out_at,
  coalesce(a.hourly_rate_override_lyd, p.hourly_rate_lyd, 0) as hourly_rate_lyd,
  greatest(0, extract(epoch from
    (coalesce(a.clocked_out_at, now()) - a.clocked_in_at)
  ) / 3600.0)                     as hours,
  greatest(0, extract(epoch from
    (coalesce(a.clocked_out_at, now()) - a.clocked_in_at)
  ) / 3600.0)
    * coalesce(a.hourly_rate_override_lyd, p.hourly_rate_lyd, 0)
                                  as labor_cost_lyd
from pos_shift_attendees a
left join profiles p on p.id = a.user_id;
grant select on shift_labor_cost to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Expense register
-- ──────────────────────────────────────────────────────────────────────
create table if not exists expense_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references pos_branches(id),  -- null = corporate / cross-branch
  paid_at date not null,
  category text not null check (category in (
    'rent','utilities','marketing','supplies','maintenance',
    'wages_one_off','professional_fees','licenses','bank_fees',
    'other_opex','capex'
  )),
  amount_lyd numeric(12,2) not null check (amount_lyd >= 0),
  vendor text,
  notes text,
  receipt_url text,
  bank_transaction_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists expense_entries_paid_at_idx on expense_entries (paid_at desc);
create index if not exists expense_entries_branch_idx  on expense_entries (branch_id, paid_at desc);

alter table expense_entries enable row level security;
create policy "expense_entries_owner_only" on expense_entries
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ──────────────────────────────────────────────────────────────────────
-- 4. Bank transactions (CSV import target)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_label text not null,
  posted_at date not null,
  description text,
  amount_lyd numeric(12,2) not null,
  balance_after_lyd numeric(12,2),
  raw_row jsonb,
  category text,
  category_source text default 'auto'
    check (category_source in ('auto','rule','manual')),
  matched_expense_id uuid references expense_entries(id),
  reconciled boolean default false,
  imported_at timestamptz default now(),
  imported_by uuid references profiles(id)
);
create index if not exists bank_transactions_date_idx on bank_transactions (posted_at desc);
-- Dedupe constraint to make CSV re-imports idempotent.
create unique index if not exists bank_transactions_dedupe_uidx on bank_transactions
  (account_label, posted_at, amount_lyd, coalesce(description, ''));

alter table bank_transactions enable row level security;
create policy "bank_transactions_owner_only" on bank_transactions
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- Back-link FK from expense to bank (defined here once both tables exist).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'expense_entries_bank_transaction_fk'
  ) then
    alter table expense_entries
      add constraint expense_entries_bank_transaction_fk
      foreign key (bank_transaction_id) references bank_transactions(id) on delete set null;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────
-- 5. Recipe linkage for Menu Profitability Matrix
-- ──────────────────────────────────────────────────────────────────────
alter table pos_products
  add column if not exists recipe_id uuid references recipes(id) on delete set null;
create index if not exists pos_products_recipe_idx on pos_products (recipe_id);

-- ──────────────────────────────────────────────────────────────────────
-- 6. Reporting RPCs
-- ──────────────────────────────────────────────────────────────────────

-- Daily P&L for a branch (or all) in a period.
create or replace function public.finance_pnl(
  p_branch_id uuid,        -- null = all branches
  p_from date,
  p_to   date
) returns jsonb
language sql stable security definer
set search_path = public
as $$
  with sales as (
    select
      coalesce(sum(case when status='completed' then total else 0 end), 0) as net_revenue,
      coalesce(sum(case when status='completed' then discount_amount else 0 end), 0) as discounts,
      count(*) filter (where status='completed') as orders_count
    from pos_orders
    where (p_branch_id is null or branch_id = p_branch_id)
      and created_at::date >= p_from and created_at::date <= p_to
  ),
  cogs_per_order as (
    select
      o.id,
      coalesce(sum(
        coalesce((
          select sum(ri.amount * i.cost_per_unit)
          from recipe_ingredients ri
          join ingredients i on i.id = ri.ingredient_id
          where ri.recipe_id = pp.recipe_id
        ), 0) * oi.quantity
      ), 0) as cogs_lyd
    from pos_orders o
    join pos_order_items oi on oi.order_id = o.id
    left join pos_products pp on pp.id = oi.product_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.created_at::date >= p_from and o.created_at::date <= p_to
      and o.status = 'completed'
    group by o.id
  ),
  cogs as (
    select coalesce(sum(cogs_lyd),0) as cogs_lyd from cogs_per_order
  ),
  labor as (
    select coalesce(sum(labor_cost_lyd),0) as labor_lyd
    from shift_labor_cost slc
    where (p_branch_id is null or slc.branch_id = p_branch_id)
      and slc.clocked_in_at::date >= p_from
      and slc.clocked_in_at::date <= p_to
  ),
  opex as (
    select
      coalesce(sum(amount_lyd) filter (where category not in ('capex')),0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (where category = 'capex'),0)        as capex_lyd
    from expense_entries
    where (p_branch_id is null or branch_id = p_branch_id or branch_id is null)
      and paid_at >= p_from and paid_at <= p_to
  )
  select jsonb_build_object(
    'period_from',  p_from,
    'period_to',    p_to,
    'branch_id',    p_branch_id,
    'orders',       (select orders_count from sales),
    'revenue_net',  (select net_revenue from sales),
    'discounts',    (select discounts from sales),
    'cogs',         (select cogs_lyd from cogs),
    'labor',        (select labor_lyd from labor),
    'opex',         (select opex_lyd from opex),
    'capex',        (select capex_lyd from opex),
    'prime_cost',   (select cogs_lyd from cogs) + (select labor_lyd from labor),
    'net_contribution',
        (select net_revenue from sales)
      - (select cogs_lyd from cogs)
      - (select labor_lyd from labor)
      - (select opex_lyd from opex)
  );
$$;
grant execute on function public.finance_pnl(uuid, date, date) to authenticated;

-- Menu profitability per pos_product in a period.
create or replace function public.finance_menu_matrix(
  p_branch_id uuid,
  p_from date,
  p_to   date
) returns table (
  product_id uuid,
  product_name text,
  recipe_id uuid,
  has_cost boolean,
  unit_price numeric,
  unit_cost numeric,
  contribution_margin numeric,
  contribution_margin_ratio numeric,
  units_sold numeric,
  revenue numeric,
  total_contribution numeric
)
language sql stable security definer
set search_path = public
as $$
  with sold as (
    select
      oi.product_id,
      max(oi.product_name) as product_name,
      sum(oi.quantity)::numeric as units_sold,
      sum(oi.total)::numeric as revenue,
      max(oi.unit_price) as unit_price
    from pos_order_items oi
    join pos_orders o on o.id = oi.order_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.status = 'completed'
      and o.created_at::date >= p_from and o.created_at::date <= p_to
    group by oi.product_id
  ),
  costed as (
    select
      pp.id  as product_id,
      pp.recipe_id,
      coalesce((
        select sum(ri.amount * i.cost_per_unit)
        from recipe_ingredients ri
        join ingredients i on i.id = ri.ingredient_id
        where ri.recipe_id = pp.recipe_id
      ), 0)::numeric as unit_cost
    from pos_products pp
  )
  select
    s.product_id,
    s.product_name,
    c.recipe_id,
    (c.recipe_id is not null) as has_cost,
    s.unit_price,
    coalesce(c.unit_cost, 0) as unit_cost,
    (s.unit_price - coalesce(c.unit_cost, 0)) as contribution_margin,
    case when s.unit_price > 0
         then (s.unit_price - coalesce(c.unit_cost, 0)) / s.unit_price
         else 0 end as contribution_margin_ratio,
    s.units_sold,
    s.revenue,
    (s.unit_price - coalesce(c.unit_cost, 0)) * s.units_sold as total_contribution
  from sold s
  left join costed c on c.product_id = s.product_id;
$$;
grant execute on function public.finance_menu_matrix(uuid, date, date) to authenticated;

-- Cash & runway snapshot.
create or replace function public.finance_cash_runway(
  p_branch_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_cash numeric;
  v_burn_4w numeric;
  v_runway_weeks numeric;
  v_upcoming_30d numeric;
begin
  select cash_on_hand_lyd into v_cash from finance_settings where id='default';

  -- Average weekly burn over last 4 weeks: opex (expenses) excluding capex.
  with weekly as (
    select date_trunc('week', paid_at)::date as wk,
           sum(amount_lyd) as opex
    from expense_entries
    where paid_at >= current_date - interval '28 days'
      and category <> 'capex'
      and (p_branch_id is null or branch_id = p_branch_id or branch_id is null)
    group by 1
  )
  select coalesce(avg(opex), 0) into v_burn_4w from weekly;

  v_runway_weeks := case when v_burn_4w > 0 then v_cash / v_burn_4w else null end;

  select coalesce(monthly_rent_lyd,0) + coalesce(monthly_utilities_lyd,0)
       + coalesce(monthly_other_fixed_lyd,0)
    into v_upcoming_30d
    from finance_settings where id='default';

  return jsonb_build_object(
    'cash_on_hand_lyd', coalesce(v_cash, 0),
    'avg_weekly_burn_lyd', coalesce(v_burn_4w, 0),
    'runway_weeks', v_runway_weeks,
    'upcoming_30d_outflows_lyd', coalesce(v_upcoming_30d, 0)
  );
end;
$$;
grant execute on function public.finance_cash_runway(uuid) to authenticated;
