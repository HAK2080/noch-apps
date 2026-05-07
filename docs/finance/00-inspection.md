# Finance — Phase 0 Inspection

**Auditor:** Opus 4.7 · **Date:** 2026-05-08 · **Scope:** what already exists in this repo that touches money, sales, or operations. **No code written.**

---

## 1. Money/operations data sources currently in the repo

### 1.1 POS sales (the ground truth)
| Table | Columns relevant to Finance | Notes |
|---|---|---|
| `pos_orders` | `branch_id, shift_id, order_number, subtotal, discount_amount, discount_pct, total, payment_method, cash_tendered, change_due, card_amount, presto_collected, served_by, status, created_at, client_created_at, idempotency_key, loyalty_customer_id, loyalty_stamps_awarded, voided_at, void_reason` | The single best source of truth for revenue. Status `'completed'` / `'voided'`. `created_at` reflects sale time even for offline-synced orders (per audit fix 2026-05-07). |
| `pos_order_items` | `order_id, product_id, product_name, unit_price, quantity, total, refunded_qty, notes` | Line-level detail. `refunded_qty` for partial refunds. |
| `pos_order_item_modifiers` | `order_item_id, modifier_id, modifier_name, price_delta` | Snapshot of modifier choices. Already folded into `unit_price`. |
| `pos_orders.payment_method` ∈ `cash | card | split | presto` | Card = Verifone. Presto = aggregator delivery, "owed by Presto" until reconciled. |
| `pos_shifts` | `total_sales, total_orders, total_cash_sales, total_card_sales, total_presto_sales, total_presto_uncollected, total_discounts, total_paid_in, total_paid_out, total_safe_drop, total_tip_out, expected_cash, opening_cash, closing_cash, cash_difference, opened_at, closed_at` | Per-branch shift counters. Shift close is locked + reconciled (audit-fixed). |
| `pos_cash_movements` | `branch_id, shift_id, movement_type, amount, reason, served_by, created_at` | Paid-in / paid-out / safe-drop / tip-out / no-sale drawer pop. Already wired to `expected_cash`. |
| `pos_audit_log` | `branch_id, action, entity_type, entity_id, metadata` | Records `order_created`, `order_voided`, `partial_refund`, `shift_closed`, `cash_movement`, `presto_collected`. **Highly useful for variance investigation.** |
| `pos_inventory_movements` | `branch_id, product_id, movement_type ('sale'|'void'|'refund'|'adjust'), quantity, stock_before, stock_after` | Stock effect of every sale. |
| `pos_products` | `price, stock_qty, low_stock_alert, track_inventory, is_sold_out, is_active, visible_on_menu` | **No `cost_price` column.** COGS comes from recipes (see 1.2), not from products directly. |

### 1.2 Recipes & ingredients (cost side)
**Two parallel systems exist — flag in red:**

1. **Recipe-card system** (`supabase/schema_recipes.sql`):
   - `recipes` — for the barista-training surface. `ingredients` field is a **JSONB** array of `{ name, amount, unit }`. **No cost.** Used to display recipe cards, not to calculate COGS.

2. **Cost-calculator system** (`apps/pos/src/modules/costCalculator/`, tables: `ingredients` + `recipe_ingredients` join + `recipes`):
   - `ingredients` (separate table): name, unit, cost-per-unit, supplier, category. **This is the cost data.**
   - `recipe_ingredients` (join table): `recipe_id`, `ingredient_id`, `amount`. Computes per-recipe cost via `apps/pos/src/modules/costCalculator/components/Dashboard.jsx:69` `calcRecipeTotalCost`.
   - **NEEDS_MANUAL_VERIFY:** are these the same `recipes` rows as the schema_recipes.sql ones, or a different table? Search hit `recipe_ingredients` JOIN against `recipes`, suggesting yes — but the JSONB-`ingredients` column in `recipes` and the join-table-based ingredients in `recipe_ingredients` are **independent representations**. Drift risk.

**Implication for Finance MVP:** The Menu Profitability Matrix (§1.3 of the brief) needs a **single source of truth** for variable cost per menu item. Today that's `recipe_ingredients × ingredients.cost_per_unit`. The link from `pos_products` (what's sold) to `recipes` (what costs) is **not formal** — `pos_products.name` ≈ `recipes.name`, but there's no FK. Need either (a) add `pos_products.recipe_id` FK, or (b) name-matching layer with manual override table. Recommend (a).

### 1.3 Inventory
| Table | Columns | Notes |
|---|---|---|
| `pos_inventory_movements` | per-branch, per-product, sale/void/refund/adjust | Already there. |
| `pos_products.stock_qty` | live count | Atomic decrement on sale (audit-fixed). |
| `stock_check_items` + `stock_check_entries` | weekly priority-based check (critical / important / low) | Used by `POSStockCheck.jsx`. |
| `procurement_orders` (table from `20260412000000_v3_cost_inventory_analytics.sql`) | empty schema row, intent unclear | NEEDS_MANUAL_VERIFY — is this in active use? |
| `suppliers` (defined twice: `20260417_001_schema_additions.sql` AND `20260502020000_suppliers_table.sql`) | name, contact, category | Duplicate definitions; verify which one runs. |

### 1.4 Existing finance-adjacent tables (already in DB, partially used)
- `business_metrics` (from `20260412000000_v3_cost_inventory_analytics.sql`) — period-aggregated revenue/cogs/margin/aov/breakdowns. **Looks like it was built for an earlier analytics pass.** Schema is present; no UI consumer found in `apps/pos/src/`. NEEDS_MANUAL_VERIFY whether it's populated.
- `sales_uploads` + `sales_transactions` (same migration) — pre-POS-system bulk sales import. Likely abandoned now that `pos_orders` exists. **Recommend explicitly: do not source Finance metrics from these; use `pos_orders` only.**
- `operating_costs` (from `20260417_big_build.sql`) — six columns: `branch_id, cost_type, amount, period_start, period_end, notes`. Minimal expense register. **Schema is there, no UI consumer found.** Could be the seed for the v1 Expense Register, but it's missing: vendor, category enum, receipt attachment, paid_at. Better to design fresh than retrofit.
- `business_lines` (from `20260417_big_build.sql`) — empty intent.

### 1.5 Per-branch P&L pieces already running
| Piece | Where | Status |
|---|---|---|
| Daily Z-report | `apps/pos/src/modules/pos/pages/POSEndOfDay.jsx` | Live. Prints + on-screen. Shows cash/card/presto totals, paid-in/out, top products. |
| Sales reports (today/week/month, by product, by barista) | `apps/pos/src/modules/pos/pages/POSReports.jsx` | Live. Pulls from `pos_sales_daily` view + `pos_sales_by_product` / `pos_sales_by_barista` RPCs. |
| Daily-sales view | `pos_sales_daily` (Postgres view in migration `20260507030000`) | gross, discounts, cash/card/split/presto, voided, by branch by day. **Already exists. The Finance MVP should consume this.** |

### 1.6 Cost calculator (already in repo)
At `/cost-calculator/*` — `apps/pos/src/modules/costCalculator/` and `apps/pos/src/pages/CostCalculator.jsx`. Owner-only. Pages: Dashboard, Recipes, Ingredients, RecipeBuilder, Stock, Settings, MenuSimulator, Auth. **Already calculates per-recipe cost and per-recipe gross margin.** This is where the Menu Profitability Matrix should source unit cost data.

---

## 2. Where money/sales/cost data is stored, displayed, or calculated today

| Data | Storage | Display | Calculation |
|---|---|---|---|
| Revenue (today) | `pos_orders` rows, `pos_shifts.total_sales` (denormalised) | `POSEndOfDay`, `POSReports`, `POSOrders` | summed in JS at render time + via `pos_sales_daily` view |
| Discounts | `pos_orders.discount_amount`, `pos_shifts.total_discounts` | `POSEndOfDay`, Z-report line | summed |
| Cash on hand (in shift) | `pos_shifts.expected_cash` | `POSEndOfDay` | atomic increment in `create_pos_order` + `record_cash_movement` |
| Cash variance | `pos_shifts.cash_difference` | `POSEndOfDay` | actual − expected at close |
| Voids | `pos_orders.status='voided'`, `pos_shifts.total_*` are reversed | `POSOrders`, Z-report (in `pos_sales_daily.voided`) | atomic via `void_pos_order` RPC |
| Refunds | `pos_order_items.refunded_qty`, `pos_inventory_movements` | `POSOrders` Refund modal | atomic via `refund_pos_order_lines` RPC |
| Recipe cost | `ingredients.cost_per_unit × recipe_ingredients.amount` | `CostCalculator/Dashboard.jsx`, `CostCalculator/Recipes.jsx` | client-side reduce. Not denormalised. |
| Stock-on-hand | `pos_products.stock_qty` | `POSInventory`, `POSStockCheck` | live |
| Operating costs | `operating_costs` table (no UI) | nowhere | nowhere |
| Labor hours | **nowhere** | n/a | n/a |
| Bank balance | **nowhere** | n/a | n/a |
| Cash flow (multi-week) | **nowhere** | n/a | n/a |

**Duplication flagged:**
- `business_metrics` table vs `pos_sales_daily` view vs in-JS aggregation in `POSReports`. **Three sources, one truth.** Pick `pos_sales_daily`; archive `business_metrics`.
- `sales_transactions` + `sales_uploads` (legacy) vs `pos_orders` (current). **Sunset legacy.**
- `recipes.ingredients` (JSONB) vs `recipe_ingredients` join table. Two recipe systems. **Pick one before building the matrix.**
- `suppliers` defined in two migrations. **Verify which migration ran last on the live DB.**

---

## 3. What's missing — the Finance MVP gap list

| Gap | Confirmed missing? | Notes |
|---|---|---|
| **Shift / labor log** (clock-in, clock-out, hourly rate) | Yes — `pos_shift_attendees` exists from audit fix 2026-05-07 (clock_in/out columns + per-attendee `total_orders` and `total_sales`), but **no hourly_rate field**. Hourly rate would normally live on `profiles` (not currently there). | Adding `hourly_rate_lyd` column on either `profiles` or `pos_shift_attendees` (per-shift override) is needed. The audit's per-barista feature was scaffolded but not wired with cost. |
| **Manual expense entry** (date, category, amount, vendor, receipt photo, notes) | Yes. `operating_costs` has the bones but no vendor/category-enum/photo. Recommend a fresh table `expense_entries`. | New table + UI. |
| **Bank statement CSV import** | Yes — fully missing. | New table `bank_transactions`, parser, categorizer. |
| **Supplier invoice OCR** | Yes — fully missing. Brief defers to Phase 3. | Skip for MVP. |
| **CapEx register** | Yes — fully missing. Brief defers to Phase 3. | Skip for MVP. |
| **Settings: fixed monthly OpEx defaults** (rent, salaries baseline, utilities baseline) | Yes. Some of `loyalty_settings` / `pos_settings` exist but no top-level finance settings table. | New table `finance_settings` (singleton). |
| **Cash & runway view** | Yes — fully missing. | Aggregates across `pos_shifts.total_cash_sales`, `expense_entries`, `bank_transactions`, plus a manual "current cash" entry. |
| **Menu profitability matrix** | Yes — fully missing. | Joins `pos_order_items` × `pos_products` × `recipes` × `recipe_ingredients` × `ingredients`. Needs the `pos_products.recipe_id` FK (or equivalent) decided up front. |
| **Threshold/target band system** | Yes — no concept of target bands today. | Needed for the colored indicators. Live in `finance_settings.thresholds` JSONB. |
| **FX rates** (LYD ↔ USD ↔ EUR for inventory imports) | NEEDS_MANUAL_VERIFY — there's a `rates` table referenced in `costCalculator/components/Dashboard.jsx:26` (`rates`). Look for `getRates()` in `apps/pos/src/lib/supabase.js`. | Likely already has a small currency-rate table for cost-calculator. Reuse. |

---

## 4. Currency model

Default is **LYD** everywhere:
- `pos_orders.total`, `pos_branches.currency = 'LYD'`, every Z-report and on-screen total prints `LYD`.
- Money math standardised at 2 decimal places via `apps/pos/src/modules/pos/lib/money.js` (audit fix).
- Receipts at 32-char width for the XP-58IIH 58mm printer.

**Multi-currency hint:** `costCalculator` references a `rates` collection (FX rates). Used for ingredient procurement costs entered in USD/EUR. **NEEDS_MANUAL_VERIFY** of the `rates` table schema and current population.

**Recommendation for Finance v1:**
- Treat the books as **LYD-only**. All revenue, COGS, labor, OpEx in LYD.
- Surface a **"USD reference rate"** input on the Finance Settings page (manual entry, monthly). Use only to render an at-a-glance USD equivalent on the runway card. Do not perform real FX conversion in the ledger.
- Phase 3 if you want true multi-currency consolidation.

---

## 5. Existing reports / dashboards that overlap with Finance scope

| Existing | What it shows | Overlap with Finance MVP | Recommendation |
|---|---|---|---|
| `apps/pos/src/modules/pos/pages/POSEndOfDay.jsx` | Z-report per shift, cash count, cash movements, top products | Daily P&L revenue side + cash | Keep — operational, fires at close. Finance dashboard sits on top of the same data, longer time range. |
| `apps/pos/src/modules/pos/pages/POSReports.jsx` | Today/week/month gross by branch, by product, by barista | Daily P&L revenue side | Keep, link from Finance dashboard. |
| `apps/pos/src/pages/BusinessAnalytics.jsx` (route `/analytics`) | OverviewTab, BranchTab, BloomTab, CategoryTab, FinancialTab, IntelligenceTab, BusinessLinesTab | **Significant overlap.** This is the closest thing to the Finance dashboard today. | **Read these tabs carefully before building.** May already have ~60% of v1. Either extend or replace. |
| `apps/pos/src/modules/costCalculator/` | Per-recipe cost, ingredients, stock | COGS side | Reuse, link from Menu Matrix. |

🔴 **High-impact finding — `BusinessAnalytics.jsx` may overlap with the Finance MVP brief by 50–70%.** Before building anything, the user and I should walk through `/analytics` in the live app and decide: extend it into Finance, or replace it. Pretending it doesn't exist will produce two competing dashboards.

---

## 6. NEEDS_MANUAL_VERIFY items (questions for the user before building)

1. **Recipe-products link.** Is there an existing column linking `pos_products` to `recipes` (or `cost_calculator` recipes)? If not, am I authorised to add `pos_products.recipe_id uuid references recipes(id)` and backfill manually for the matcha/coffee menu?
2. **`business_metrics` table.** Is anything currently writing to it? Is it considered live or dead?
3. **`sales_transactions` / `sales_uploads`.** Same question.
4. **`operating_costs` table.** Anything currently entering data here? If not, OK to deprecate and design a fresh `expense_entries` schema?
5. **`/analytics` page (BusinessAnalytics).** Does the operator currently use it? If yes, what's broken about it / what does it not answer? (Drives the decision: extend vs replace.)
6. **`rates` table.** Is FX populated and trusted? Or is the cost calculator entering ingredient costs already-converted to LYD?
7. **Hourly wage data.** Is wage info currently tracked anywhere off-app (Sheets/Whatsapp/notes)? What's the typical structure (hourly rate? monthly salary? mixed?)? This shapes the shift-log schema.
8. **Multi-branch.** Three branches seeded (`Noch Hay Alandlous`, `Noch Jaraba`, `Bloom Abu Nawas`). Brief says "Bloom is out for v1." Should the dashboard hard-filter Bloom out, or include a "branch selector" with Bloom toggleable? Most likely the latter.
9. **Cash balance** — owner-entered, or imported from bank? If the bank export comes weekly, how do we treat the days between?
10. **Suppliers** — two migrations define `suppliers`. Which one is on the live DB right now?

---

## 7. Anti-pattern check (against the brief's anti-patterns list)

| Brief said | Risk in this codebase | Mitigation |
|---|---|---|
| "Don't store historical IG/TikTok numbers in the API responses." | Snapshot-into-our-DB is mandatory. **No snapshot table exists today.** | Add `marketing_channel_snapshots` daily-snapshot table in Phase 2 (covered by marketing inspection). |
| "Don't trust loyalty data without deduplication." | `loyalty_customers.phone` has `unique` constraint — good. But normalisation (whitespace, country code) NEEDS_MANUAL_VERIFY. | One-off cleanup pass before RFM segmentation in Phase 2. |
| "Don't surface raw data tables as dashboards." | `POSReports` has a daily-breakdown table. Acceptable as one section, but the headline screen must aggregate. | Finance dashboard's headline KPIs go above any table. |
| "Don't auto-categorize bank transactions silently." | No bank parser exists yet. | Build with confirmation step in MVP. |
| "Don't show metrics without a target." | Today's reports show numbers, not bands. | All Finance KPIs ship with target band + status colour. |

---

## 8. Recommended Phase 1 sequencing (deferred to `01-mvp-plan.md` after user review)

1. Confirm the 10 NEEDS_MANUAL_VERIFY answers in §6.
2. Walk `/analytics` together. Decide extend or replace.
3. Lock the `pos_products → recipes` linkage strategy.
4. Then write `01-mvp-plan.md` with concrete schema diffs and screen-by-screen layout.

**Stop here per the brief.**
