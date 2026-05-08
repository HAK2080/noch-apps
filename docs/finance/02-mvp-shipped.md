# Finance MVP — Shipped (2026-05-08)

Live as of `index-DnvlelMZ.js` on `apps.noch.cloud`.

## What's deployed

### Schema (migration `20260508010000_finance_mvp.sql`)
- `finance_settings` (singleton, owner-only RLS): target bands, monthly fixed-OpEx defaults, USD reference rate, cash-on-hand snapshot.
- `profiles.hourly_rate_lyd` + `pos_shift_attendees.hourly_rate_override_lyd` (per-shift override).
- `shift_labor_cost` view: `hours × rate` per attendee per shift.
- `expense_entries` (owner-only RLS, 11 categories incl. capex).
- `bank_transactions` with dedupe-on-`(account, date, amount, description)` unique index.
- `pos_products.cost_lyd` — single-number per-unit cost in LYD (the COGS source).
- `pos_products.recipe_id` (only if `recipes` table exists; nullable).
- RPCs: `finance_pnl(branch, from, to)`, `finance_menu_matrix(branch, from, to)`, `finance_cash_runway(branch)`.

### Client (`apps/pos/src/modules/finance/`)
9 tabs at `/finance` (owner-only):

| Tab | Reads | Writes |
|---|---|---|
| **Daily P&L** | `finance_pnl` RPC + `finance_settings` | — |
| **Menu profit** | `finance_menu_matrix` RPC | — |
| **Cash & runway** | `finance_cash_runway` RPC + `finance_settings` | `finance_settings` (cash, fixed OpEx, FX rate) |
| **Expenses** | `expense_entries` | `expense_entries` |
| **Shifts** | `shift_labor_cost` view + `profiles` | `profiles.hourly_rate_lyd` + `pos_shift_attendees.{clocked_*, hourly_rate_override_lyd}` |
| **Bank** | `bank_transactions` | bulk insert via dedupe upsert + `category` override |
| **Cost mapping** | `pos_products` | `pos_products.cost_lyd` (inline editor) |
| **Overview (legacy)** | analytics module's `OverviewTab` | — |
| **AI insights** | analytics module's `IntelligenceTab` | — |

Sidebar relabel: "Analytics" → "Finance". `/analytics` redirects to `/finance`. The old dashboard is preserved at `/analytics-legacy` until you confirm the new home covers your usage.

### Threshold bands (default values, editable in Settings → Finance)
- Food cost (COGS / revenue): 28–32% green band
- Labor cost (labor / revenue): 25–30% green band
- **Prime cost (COGS + labor): 55–65% green band — the headline KPI**
- Runway warning: <8 weeks shows amber; <4 weeks red

Each KPI card shows actual / target band / coloured status dot.

## What's NOT in this MVP (per brief)
- General ledger / double-entry bookkeeping (separate `docs/accounting/` plan)
- Tax / VAT
- Payroll calculation (just labor cost from shift log)
- AR/AP aging
- Multi-currency consolidation (USD reference rate is display-only)
- Forecast / scenario planning → Phase 3
- CapEx ROI tracker → Phase 3
- OCR invoice upload → Phase 3
- Modifier-cost tracking (`pos_modifiers.cost_delta_lyd`) → Phase 1.1 (overstates margin on drinks with paid modifiers like oat milk)

## How COGS works in v1
**Direct entry, not recipe-derived.** Owner enters cost per unit (LYD) per `pos_products` row in the Cost Mapping tab. The Menu Profitability Matrix and Daily P&L COGS line read `pos_products.cost_lyd × oi.quantity`. Reasoning: the existing Cost Calculator computes per-recipe cost in JavaScript using FX rates and unit conversion (`calcCostPerBaseUnit` in `costCalculator/components/Dashboard.jsx`); replicating that math in PL/pgSQL is a multi-day refactor that didn't justify v1 scope.

**Phase 1.1 follow-up:** add an "Import from Cost Calculator" button that runs the JS function on-demand and writes results to `pos_products.cost_lyd`.

## Operator setup checklist (15 min)

1. **Cost mapping** — Finance → Cost mapping tab → enter cost per unit for each active menu item. Use the Cost Calculator (`/cost-calculator`) in another tab to look up the recipe totals.
2. **Hourly rates** — Finance → Shifts tab → set hourly rate per active staff member.
3. **Monthly fixed OpEx** — Finance → Cash & runway tab → Edit fixed OpEx → enter rent, utilities, other monthly fixed costs.
4. **Cash on hand** — same tab → Update → enter current LYD on-counter + safe.
5. **(Optional) USD reference rate** — same tab → Set → enter LYD-per-USD for the at-a-glance USD equivalent.

After step 1, the Menu Profitability Matrix has real numbers. After step 2, Daily P&L's labor line populates as shifts run.

## Known limitations / gotchas

- **`/analytics-legacy` is still owner-accessible.** It points at the old `BusinessAnalytics.jsx`. Decide whether to delete it after a few days of running the new dashboard.
- **Bank CSV parser is generic.** It tries `date,description,debit,credit,balance` first then falls back to `amount`. If a Libyan-bank export uses Arabic headers or a different layout, the CSV import will need a per-bank adapter.
- **Refunds and voids are reversed correctly in shift totals** (audit-fixed earlier) but `finance_pnl` filters by `status='completed'` and excludes voided rows — partial-refund line items still count toward revenue and COGS, which is correct (they were sold and the money was paid then later refunded as a separate cash outflow). If you want net-of-refunds revenue, that's a Phase 1.1 toggle.
- **Cron job ID `8`** scheduled `refresh-customer-segments` (marketing migration); cron extension already in repo.
- **No tests for the RPCs.** Manual verification: `select finance_pnl(null, current_date - 7, current_date)` should return non-null jsonb. If `cogs` is 0, you haven't done step 1.

## Files (commit `216ce55` + `8eedace`)
- `apps/pos/src/modules/finance/`
  - `FinanceDashboard.jsx`
  - `lib/{finance-supabase.js, thresholds.js}`
  - `components/{KPICard.jsx, PeriodSelector.jsx}`
  - `tabs/{DailyPnLTab,MenuProfitabilityTab,CashRunwayTab,ExpensesTab,ShiftsTab,BankTab,RecipeLinkerTab}.jsx`
- `apps/pos/src/App.jsx` (route additions, redirect)
- `apps/pos/src/components/Layout.jsx` (sidebar relabel)
- `supabase/migrations/20260508010000_finance_mvp.sql`

## Ship verification
- `apps/pos` build green (`index-DnvlelMZ.js` live).
- Migration `20260508010000_finance_mvp.sql` applied (revision after the initial `recipe_ingredients.amount` failure).
- Marketing migration `20260508020000_marketing_mvp.sql` applied (cron scheduled).
- Live site verified loads at `apps.noch.cloud` post-deploy (env vars baked in).

## Next sessions

- **Phase 1.1 (in 2 weeks per brief):** Import-from-Cost-Calculator button. Modifier-cost tracking. Refund-net toggle on P&L. Bank-parser adapters per Libyan bank format. CapEx + ROI register. OCR invoice upload (Google Vision / Textract).
- **Phase 3:** Forecast & scenario planner. Variance analysis vs budget.
