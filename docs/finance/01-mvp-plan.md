# Finance MVP — Implementation Plan

**Author:** Opus 4.7 · **Date:** 2026-05-08 · **Branch:** `claude/modest-goldberg-ad1a39`.
**Inputs:** [`docs/finance/00-inspection.md`](docs/finance/00-inspection.md) + user decisions on 2026-05-08:
- ✅ Extend `/analytics`, relabel if appropriate.
- ✅ Use the normalised recipe system (`recipe_ingredients × ingredients`) as cost source; add `pos_products.recipe_id` FK + tiny mapping admin UI.
- ✅ POS-issued stamps: live with the limitation; verify when ops are running.

---

## 1. Architecture

### 1.1 Where it lives

`/analytics` becomes `/finance`. The existing `BusinessAnalytics.jsx` stays (it's the closest thing to v1 today), but it gets:
- **Renamed** to `FinanceDashboard.jsx`.
- **Restructured tabs**: Overview · Daily P&L · Menu Profitability · Cash & Runway · Expenses · Shifts · Bank.
- The old "Bloom" tab is removed (Bloom is out of v1 per brief; Bloom is also out of this repo's deploys after the recent monorepo merge).
- The old "BusinessLines" tab is removed (vestigial, no clear consumer).
- Existing tabs (`OverviewTab`, `BranchTab`, `CategoryTab`, `FinancialTab`, `IntelligenceTab`) are kept as components and reorganised under the new top-level tabs.

Old route `/analytics` redirects to `/finance` via a `<Navigate>` for any deep-links.

### 1.2 Permission model

Owner-only at the route level (`OwnerRoute` wrapper, same as `/analytics` today).
Per-tab: no further gating in v1 — if you're an owner, you see everything.
Future: a manager role could see Daily P&L + Menu Profitability but not Cash, Expenses, Bank.

### 1.3 Code layout

```
apps/pos/src/modules/finance/
  ├── FinanceDashboard.jsx          ← entry; was BusinessAnalytics.jsx
  ├── components/
  │   ├── PeriodSelector.jsx        ← Today / 7d / 30d / 90d / Custom (shared)
  │   ├── KPICard.jsx               ← reuse from analytics/components/
  │   ├── ThresholdBadge.jsx        ← NEW: green/amber/red vs target band
  │   ├── ShiftEntryModal.jsx
  │   ├── ExpenseEntryModal.jsx
  │   ├── BankImportModal.jsx
  │   └── RecipeLinker.jsx          ← maps pos_product → recipe
  ├── tabs/
  │   ├── OverviewTab.jsx           ← rebadged from existing
  │   ├── DailyPnLTab.jsx
  │   ├── MenuProfitabilityTab.jsx
  │   ├── CashRunwayTab.jsx
  │   ├── ExpensesTab.jsx
  │   ├── ShiftsTab.jsx
  │   └── BankTab.jsx
  ├── lib/
  │   ├── finance-supabase.js       ← all reads + writes
  │   ├── finance-rpcs.js           ← thin wrappers over the Postgres RPCs
  │   ├── thresholds.js             ← 28-32% food cost, 25-30% labor, 55-65% prime
  │   └── bank-csv-parser.js        ← parse Libyan-bank CSV exports
  └── pages/
      └── (none — everything routes through FinanceDashboard)
```

---

## 2. Schema migration

One migration: `supabase/migrations/20260508010000_finance_mvp.sql`.

### 2.1 New tables

```sql
-- ── Settings (singleton row keyed by id='default') ────────────────────
create table if not exists finance_settings (
  id text primary key default 'default'
    check (id = 'default'),
  -- target bands (for threshold badges)
  food_cost_min_pct numeric(5,2) default 28.00,
  food_cost_max_pct numeric(5,2) default 32.00,
  labor_cost_min_pct numeric(5,2) default 25.00,
  labor_cost_max_pct numeric(5,2) default 30.00,
  prime_cost_min_pct numeric(5,2) default 55.00,
  prime_cost_max_pct numeric(5,2) default 65.00,
  -- runway alerts
  runway_warn_weeks numeric(4,1) default 8.0,
  -- monthly OpEx defaults (avoid manual entry every month)
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

-- ── Shift / labor log ────────────────────────────────────────────────
-- Per-shift attendees already exist in pos_shift_attendees (audit fix
-- 2026-05-07); this adds the wage data the brief requires.
alter table profiles
  add column if not exists hourly_rate_lyd numeric(8,2);
-- Optional per-shift override (overtime, training rate) — null = use profile rate:
alter table pos_shift_attendees
  add column if not exists hourly_rate_override_lyd numeric(8,2);

-- Computed labor_cost view: hours × rate per attendee per shift.
create or replace view shift_labor_cost as
select
  a.id                            as attendee_id,
  a.shift_id,
  a.user_id,
  a.branch_id,
  a.clocked_in_at,
  a.clocked_out_at,
  coalesce(a.hourly_rate_override_lyd, p.hourly_rate_lyd, 0) as hourly_rate_lyd,
  -- minutes clocked, capped at "now" for open shifts
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

-- ── Expense register ────────────────────────────────────────────────
-- The legacy `operating_costs` table is left alone (deprecated).
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
  receipt_url text,                 -- supabase storage URL (optional)
  bank_transaction_id uuid,         -- back-link if reconciled to a bank line
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists expense_entries_paid_at_idx on expense_entries (paid_at desc);
create index if not exists expense_entries_branch_idx on expense_entries (branch_id, paid_at desc);
alter table expense_entries enable row level security;
create policy "expense_entries_owner_only" on expense_entries
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ── Bank transactions (CSV import) ─────────────────────────────────
create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_label text not null,         -- which bank/account
  posted_at date not null,
  description text,
  amount_lyd numeric(12,2) not null,    -- signed (+ in, - out)
  balance_after_lyd numeric(12,2),
  raw_row jsonb,                        -- the original CSV row, for audit
  category text,                        -- auto-categorized (override-able)
  category_source text default 'auto'   -- 'auto' | 'rule' | 'manual'
    check (category_source in ('auto','rule','manual')),
  matched_expense_id uuid references expense_entries(id),
  reconciled boolean default false,
  imported_at timestamptz default now(),
  imported_by uuid references profiles(id),
  unique (account_label, posted_at, amount_lyd, description) -- dedupe on re-imports
);
create index if not exists bank_transactions_date_idx on bank_transactions (posted_at desc);
alter table bank_transactions enable row level security;
create policy "bank_transactions_owner_only" on bank_transactions
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- ── Recipe linkage (Menu Profitability Matrix dependency) ──────────
alter table pos_products
  add column if not exists recipe_id uuid references recipes(id) on delete set null;
create index if not exists pos_products_recipe_idx on pos_products (recipe_id);
```

### 2.2 Reporting RPCs

All read-only, called from the dashboard. Each is a thin wrapper that respects branch + period filters.

```sql
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
      coalesce(sum(total),0) - coalesce(sum(case when status='voided' then total else 0 end),0) as net_revenue,
      coalesce(sum(discount_amount),0) as discounts,
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

-- Menu profitability matrix data (per pos_product).
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
    c.unit_cost,
    (s.unit_price - c.unit_cost) as contribution_margin,
    case when s.unit_price > 0
         then (s.unit_price - c.unit_cost) / s.unit_price
         else 0 end as contribution_margin_ratio,
    s.units_sold,
    s.revenue,
    (s.unit_price - c.unit_cost) * s.units_sold as total_contribution
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

  -- Average weekly burn over last 4 weeks: COGS + labor + opex
  with last_4w as (
    select extract(week from now()) - 4 as wk
  ),
  weekly as (
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

  -- Upcoming known outflows over next 30 days: monthly defaults + scheduled expenses
  -- (For MVP: monthly defaults only; recurring expenses are Phase 3.)
  select coalesce(monthly_rent_lyd,0) + coalesce(monthly_utilities_lyd,0)
       + coalesce(monthly_other_fixed_lyd,0)
    into v_upcoming_30d
    from finance_settings where id='default';

  return jsonb_build_object(
    'cash_on_hand_lyd', v_cash,
    'avg_weekly_burn_lyd', v_burn_4w,
    'runway_weeks', v_runway_weeks,
    'upcoming_30d_outflows_lyd', v_upcoming_30d
  );
end;
$$;
grant execute on function public.finance_cash_runway(uuid) to authenticated;
```

### 2.3 Migrations to apply

In order:
1. `20260508010000_finance_mvp.sql` (this migration). Pure additions; no destructive changes. Safe to apply on live before any client ships.

After this migration, `expense_entries`, `bank_transactions`, `finance_settings`, `pos_products.recipe_id`, the labor view, and the three RPCs all exist server-side. The new client code reads them via the existing supabase client.

---

## 3. Screens, in order they ship

### 3.1 Foundations (must ship before P&L renders correctly)

**[A] Recipe Linker** (`/finance/menu-cost-mapping`)
- Two-column screen: left list of `pos_products` (active, visible), right list of `recipes` (filtered by category match).
- Click product → click recipe → save `pos_products.recipe_id`. Bulk-link by name match available as a "Suggest links" button (case-insensitive substring).
- Status pill per product: ✅ linked / ⚠ unlinked.
- One-time owner setup; finished in 5–10 minutes for the current 30-item menu.

**[B] Shift / Labor Log** (`/finance/shifts`)
- Tab in FinanceDashboard. List of shifts grouped by day. Each shift shows: branch, attendees, total hours, total labor cost.
- Click a shift → modal: per-attendee row with clock-in/clock-out and rate. Owner can edit times after the fact and override rate per attendee per shift.
- "Add shift retroactively" CTA opens an empty modal — for the case where staff forgot to clock in via POS terminal.
- This populates `shift_labor_cost` view automatically; Daily P&L's labor line reads from there.

**[C] Expense Register** (`/finance/expenses`)
- List grouped by month. Filter by category, branch, date range.
- "Add expense" modal: date, category enum (radio), amount, vendor (autocomplete from previous), notes, receipt photo upload (Supabase Storage, bucket `expense-receipts`).
- Bulk-edit: select 2+ rows → set category for all (rare but useful after bank import).
- Settings page surfaces the 3 monthly defaults (rent, utilities, other fixed) — saved once, not entered every month.

### 3.2 Headline screen

**[D] Daily P&L Tab** (default tab on `/finance`)
- **Period selector** (Today / 7d / 30d / 90d / Custom). Default: 7d.
- **Branch selector** (All / Hay Alandlous / Jaraba). Bloom hidden.
- KPI grid (4 cards top row, 4 below) — every card has `actual / target band / status badge`:
  1. Revenue (net) · target n/a · just shown
  2. COGS · target 25–32% of revenue
  3. Labor · target 25–30% of revenue
  4. **Prime Cost** (COGS + Labor) · target 55–65% — **biggest card, top-left, the headline number**
  5. Other OpEx
  6. Net contribution
  7. Gross margin %
  8. Net margin %
- One sparkline below: net contribution over the last 30 days (always 30, regardless of period selector — gives context).
- Click a KPI → drill-down: trend over period, breakdown by branch, link to underlying data (sales report / shifts / expenses).

### 3.3 Menu Profitability Matrix

**[E] Menu Profitability Tab** (`/finance#menu-profitability`)
- 2×2 quadrant scatter: x = contribution margin/unit, y = units sold.
- Quadrant lines auto-place at the median CM and median units (so the four buckets contain ~25% of items each by default).
- Each item is a dot; click → modal:
  - Full cost breakdown (ingredient × cost × amount)
  - Sales trend over period
  - Margin trend over period
  - Recommended action label (Star / Workhorse / Puzzle / Dog) with one-line guidance:
    - Star: protect, don't change
    - Workhorse: re-engineer cost (top 3 most expensive ingredients shown) or raise price
    - Puzzle: promote harder
    - Dog: kill or rework
- Items without `recipe_id` show in a **separate "Needs cost mapping" panel above the matrix** — visible nudge to use the Recipe Linker.

### 3.4 Cash & Runway

**[F] Cash & Runway Tab** (`/finance#cash`)
- Big card: cash on hand (LYD + USD-equivalent at the reference rate)
- "Update cash" inline button → small modal — owner-entered until bank import is mature.
- 4-week burn rate (LYD/week)
- Weeks of runway — colour: green ≥ runway_warn_weeks, amber 4–8, red <4.
- Next 30 days outflows: rent, utilities, other fixed (from `finance_settings`).
- "Recent imports" preview from `bank_transactions`.

### 3.5 Bank import

**[G] Bank Tab** (`/finance#bank`)
- "Upload CSV" button → modal:
  1. Pick account label.
  2. Drop CSV.
  3. Preview parsed rows with auto-categorisation.
  4. Row-by-row confirm/override category before commit.
- Auto-categorisation: simple keyword rules in `bank-csv-parser.js`. E.g. "rent" → `rent`, "kahraba" / "GECOL" → `utilities`, "Verifone" / "card settlement" → ignore (already in POS). Editable rules table is Phase 3.
- After commit: `bank_transactions` rows; uncategorised rows surfaced for tagging.
- Reconciliation view: list bank lines + matching expense entries; click to link. Match increases trust in the cash-on-hand figure.

---

## 4. What v1 explicitly does NOT include

(per brief)

- General ledger / double-entry bookkeeping → if you want that, see `docs/accounting/00-plan.md`. Different scope.
- Tax / VAT
- Payroll calculation (just labor cost from shift log)
- AR/AP aging
- Multi-currency consolidation (USD reference rate is display-only)
- Forecast / scenario planning → Phase 3
- CapEx ROI tracker → Phase 3
- OCR invoice upload → Phase 3

---

## 5. Sequencing (what ships when)

**Day 1 (1 sitting):**
- Migration `20260508010000_finance_mvp.sql`
- Recipe Linker UI (read-only matrix relies on this)
- Shift/Labor Log UI + view
- Expense Register UI

**Day 2:**
- Daily P&L Tab (RPC + tab UI)
- Menu Profitability Tab (RPC + tab UI)

**Day 3:**
- Cash & Runway Tab + finance_settings UI
- Bank CSV Importer

**Day 4 (if budget):**
- Polish, mobile responsive pass, link `/analytics` → `/finance` redirect, sidebar relabel.
- Write `docs/finance/02-mvp-shipped.md`.

The Day-1 set is the foundation; without these the headline screen has nothing to render. Build foundations bottom-up, not the dashboard first.

---

## 6. Open assumptions (called out so you can correct before code lands)

1. **Hourly wage data lives on `profiles.hourly_rate_lyd`.** If wages are hidden from staff (likely yes — RLS on profiles needs to gate this), I'll add an explicit `wages` policy. (Today `profiles` is broadly readable per the audit; will tighten.)
2. **Active branches for v1** = "Noch Hay Alandlous" + "Noch Jaraba". Bloom row stays in DB but the FinanceDashboard branch selector hides it.
3. **Monthly OpEx defaults** are entered once via Settings; they're not auto-posted as `expense_entries` rows. They're a Cash & Runway "upcoming outflows" hint only, not a P&L line. (If you'd rather they auto-post each month, say so — I'll add a cron RPC.)
4. **Receipt photos** go to a new Supabase Storage bucket `expense-receipts`, owner-only access. ~50 MB ceiling; receipts are usually <1 MB each.
5. **Existing `business_metrics`, `sales_transactions`, `sales_uploads` tables** are explicitly **not consumed** by the Finance MVP. They stay in the schema for now (no destructive migration). A future cleanup can drop them.
6. **`/analytics` → `/finance`** redirect ships in the same commit. Existing tabs (Overview/Branch/Category/Financial/Intelligence) are kept and reorganised — I won't delete the components, just rewire them under the new tab structure.
7. **Branch filter in cross-branch expenses.** `expense_entries.branch_id` is nullable. Null = corporate (e.g. brand consultant fees). The Daily P&L sums null-branch expenses into "All branches" view but excludes them from per-branch.

---

## 7. Verification plan (how I'll know it works)

1. After migration: insert one fake expense, one fake shift attendee with rate, link one product to a recipe. Run `select finance_pnl(null, current_date - 7, current_date)` → expect non-zero `cogs`, non-zero `labor`, non-zero `opex`.
2. UI: visit `/finance` → 7d Daily P&L renders with the 8 KPI cards, all coloured against thresholds.
3. UI: Menu Profitability tab shows ≥1 dot in the matrix (the linked product) and a "Needs cost mapping" panel for unlinked products.
4. UI: Bank import a small test CSV (5 rows) → confirm categorise → see rows in `bank_transactions`.
5. Build green; lint clean for new files only.
6. **Hardware-side verification (POS receipts) is unchanged** — Finance is a read-mostly module, so POS flow is untouched.

I'll not deploy until you say so. Migration applies first (you control it via Supabase SQL editor), then `python deploy.py apps`.

---

## 8. Risk list (before I start coding)

| Risk | Mitigation |
|---|---|
| `pos_products.recipe_id` left null on most products → P&L shows wrong COGS | Loud "Needs cost mapping" panel + bulk-link button. Day-1 deliverable. |
| `profiles.hourly_rate_lyd` accidentally exposed to staff | RLS tightening migration; verify with the existing audit fixes. |
| Bank CSV format varies between Libyan banks (no standard) | Make the parser configurable per `account_label`; ship one parser for the most-used bank, document how to add another. |
| Existing `BusinessAnalytics.jsx` has bespoke logic I overwrite | Read it line-by-line before refactor; stash old tabs as `OldOverviewTab.jsx` etc. for reference. |
| Adding `recipe_id` to `pos_products` triggers a re-render storm in POSTerminal/POSProducts | Audit for `pos_products.*` queries that don't select-only-cols and update if needed. |

**Ready to start Day-1 build on your go.**
