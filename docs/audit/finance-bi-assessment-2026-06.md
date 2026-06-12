# Finance & BI Assessment — June 2026

Expert assessment of the Noch finance / reporting / business-intelligence stack
for **Owner** and **Accountant** roles, plus the prioritized roadmap. Written
alongside the June 2026 release that ships accountant access, BI exports, and
optional overtime pay.

---

## 1. What shipped in this release (2026-06-12)

| Area | Change |
|---|---|
| **RBAC** | Single `features.js` registry now drives both the Role Manager matrix and the sidebar. New manageable keys: `finance`, `marketing`, `products`, `content_studio`, `messages`, `experiments`, `sales`. Role Manager cells now cycle **off → view → view+edit**. |
| **Routing/nav** | `/finance`, `/report`, `/analytics-legacy`, `/expenses`, `/marketing` moved from hard role locks (`OwnerRoute`/`ElevatedRoute`) to permission-driven `PermissionRoute`. Sidebar is filtered by `hasAccess()` with `fallbackRoles` preserving every role's current links (zero regression). |
| **Accountant** | New `accountant` permissions seeded: read-only `finance`, `expenses`, `sales`, `dashboard`, `reports`. DB-level SELECT RLS added on `finance_settings`, `expense_entries`, `finance_budgets` for the accountant role. Writes remain owner-only at the DB layer. |
| **Finance read-only mode** | `FinanceDashboard` tabs are split into **view** (P&L, Menu, Cash, Expenses, Shifts, Variance, Overview) and **edit** (Bank, Cost mapping, CapEx, Forecast, AI). A `readOnly` accountant sees view tabs with every edit affordance hidden. |
| **BI exports** | CSV (UTF-8 BOM → Arabic-safe in Excel) + Print on Daily P&L, Expenses, Variance, Shift labour, and POS sales-by-product. |
| **Payroll** | Optional **overtime** (after N hours/shift × multiplier) and **extra-day** pay (weekend / scheduled day-off × multiplier), per-staff `days_off` + `overtime_exempt`. **All OFF by default**; `shift_labor_cost` reduces exactly to `hours × rate` at defaults. |

---

## 2. Current-state inventory

**Finance module (`/finance`)** — Daily P&L, Menu profitability matrix, Cash &
runway, Expenses (read), Shifts/labour, Bank CSV import, Cost mapping, Variance
vs budget, CapEx register, Forecast scenarios, AI insights. Backed by
SECURITY DEFINER RPCs (`finance_pnl`, `finance_menu_matrix`,
`finance_cash_runway`, `finance_variance`, `finance_forecast`).

**Expenses (`/expenses`)** — full submit → approve → paid workflow with cost
centres, categories, receipts.

**Reports (`/report`)** — weekly task-stats summary to Telegram.

**POS reporting** — End-of-day reconciliation; sales-by-product / by-barista;
daily summaries.

**Legacy analytics (`/analytics-legacy`)** — older overview/branch/category
dashboards, retained for continuity.

---

## 3. Architectural gaps (the important part)

> ⚠️ **Two parallel expense systems.** `expenses` (the `/expenses` module, cost
> centres + approvals) and `expense_entries` (the Finance tab's own table).
> `finance_pnl` already UNIONs both, but data entry, RLS, and UI are duplicated.
> **Consolidate to one (`expenses`) and make `expense_entries` a view** — this is
> the single highest-value cleanup.

Other gaps, by theme:

- **Accounting model**: cash-basis only — no general ledger, no accrual, no
  double-entry, no trial balance. No VAT/tax fields. No multi-currency
  consolidation (USD rate is display-only).
- **Reporting depth**: no period-over-period / YoY comparison; no drill-down
  from a P&L KPI to underlying orders/expenses; one fixed P&L format; no
  cash-flow statement; no AR/AP aging.
- **Expenses/budget**: no recurring-expense templates (rent re-entered monthly);
  no budget enforcement/alerts; bank reconciliation is manual.
- **Payroll**: monthly_salary is informational (not posted to P&L — only
  shift-based hourly labour is); no payslips, deductions, leave/absence, or
  advance tracking; no audit log on rate/time edits.
- **Inventory costing**: COGS depends on manually-entered `pos_products.cost_lyd`
  with no completeness check; no FIFO/weighted-average ingredient costing.

---

## 4. Roadmap

**P1 — accountant effectiveness (next)**
1. Consolidate `expenses` / `expense_entries` (view + single UI).
2. Period-comparison on P&L + Overview (Δ vs previous period / same month last year).
3. Drill-down: click a P&L KPI → underlying rows.
4. Recurring-expense templates (auto-post monthly fixed OpEx).

**P2 — financial control**
5. Cash-flow statement + AR/AP aging.
6. Budget alerts (variance threshold → dashboard flag / notification).
7. Payslip generation from `shift_labor_cost` + monthly salary; audit log on rate/time edits.
8. VAT/tax fields and a tax summary report.

**P3 — depth**
9. General ledger / accrual layer (double-entry) — only if accounting maturity requires it.
10. Ingredient-level costing method (weighted average) feeding `cost_lyd`.
11. Multi-currency consolidation for reporting.

---

## 5. Roles — effective access after this release

| Capability | Owner | Accountant | Notes |
|---|---|---|---|
| Daily P&L / Menu / Cash / Variance (read) | ✓ | ✓ | accountant read-only |
| Expenses dashboard (read) | ✓ | ✓ | approve/paid stay owner-only in-page |
| Shift labour + rates | ✓ edit | ✓ read | rate/time editors hidden for accountant |
| Bank / Cost mapping / CapEx / Forecast / AI | ✓ | ✗ | edit-level tabs, hidden unless `finance` can_edit granted |
| CSV / print exports | ✓ | ✓ | all view surfaces |
| Overtime / extra-day settings | ✓ | ✗ | owner / finance-edit only |

Granting `finance` **can_edit** to the accountant in Manage Roles unlocks the
edit tabs and affordances without any code change.
