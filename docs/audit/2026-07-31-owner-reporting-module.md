# Owner Reporting and Financial Accuracy

**Module:** 1 of 8
**Active scope:** Owner reporting and financial accuracy
**Status:** Complete and live

## Purpose and users

The primary user is the owner reviewing business health across all branches or one branch. Finance users need the same figures with drill-down evidence. Branch managers may consume branch-scoped results, but this module does not expand their permissions.

The module must answer, within one minute:

1. How much did we sell and how many completed orders did we serve?
2. Do recorded cash, card, Presto, and other payments reconcile with net sales?
3. What remains after product, staff, direct operating, and shared costs?
4. Which branch or exception needs attention?
5. How current and complete is the evidence?

## Current surface map

| Surface | Business purpose | Authoritative data |
|---|---|---|
| Management Report (`/report`) | One-minute owner health and exception view | `finance_pnl`, `finance_payment_reconciliation`, branch P&Ls, inventory control RPC |
| Finance Executive Summary | Branch comparison, liquidity snapshot, and drill-down entry point | `finance_pnl`, finance settings, bank transactions, cash snapshots |
| Finance Daily P&L | Detailed period P&L and cost evidence | `finance_pnl` plus finance breakdown queries |
| Sales detail (`/sales`) | Order/payment evidence and CSV | `pos_sales_daily`, completed `pos_orders`, order lines |
| Inventory Intelligence | Theoretical stock exception evidence | physical counts, completed-order recipe usage, thresholds |

The Management Report and Finance views share the same Finance P&L definition. Sales detail remains evidence, not a competing P&L calculator.

## Canonical definitions

| Metric or state | Definition | Authoritative source |
|---|---|---|
| Business day | 05:00 to 05:00 in `Africa/Tripoli`; the end boundary is exclusive | `business-time.js` and the bounds inside finance RPCs |
| Completed sales | Sum of `pos_orders.total` for completed orders in the selected business-day range, after discounts and before refunds | `finance_payment_reconciliation` |
| Refunds | Sum of `refunded_amount_lyd` on completed orders in the period | `finance_pnl` / `finance_payment_reconciliation` |
| Net sales | Completed sales minus refunds | `finance_pnl(..., p_net_of_refunds = true)` |
| Order volume | Count of completed orders | `finance_pnl` |
| Cash collected | Cash orders plus the cash portion of split orders | `finance_payment_reconciliation` |
| Card collected | Card orders plus the `card_amount` portion of split orders | `finance_payment_reconciliation` |
| Presto collected | Completed orders whose payment method is Presto | `finance_payment_reconciliation` |
| Other payments | Completed orders with a payment method outside cash, card, split, or Presto | `finance_payment_reconciliation` |
| Payment variance | Payment-source net sales minus Finance P&L net sales; reconciled at an absolute variance of at most 0.01 LYD | Management report model |
| Product costs (COGS) | Product and modifier cost attached to completed order quantities, net of refunded quantities | `finance_pnl` |
| Direct operating profit | Net sales minus COGS, direct staff cost, and direct operating expenses | `finance_pnl.net_contribution_before_shared` |
| Shared operating costs | Shared staff and shared operating expenses allocated by the dated policy | `finance_pnl.shared_costs_allocated` |
| Fully loaded operating profit | Direct operating profit minus allocated shared operating costs | `finance_pnl.net_contribution` |
| Branch reconciliation | Consolidated metric minus the sum of branch metrics; deltas over 0.01 LYD are visible | Management/finance reconciliation model |
| Report completeness | Explicit warnings for unavailable sources, missing product costs, unallocated expenses, stale counts, and reconciliation differences | `finance_pnl.data_quality` plus source metadata |

Unavailable or failed data is `null`/unavailable, never zero. Balance figures such as bank and counted cash show their own as-of dates and are not treated as period flows.

## Feature decisions

| Feature | Classification | Decision |
|---|---|---|
| One-minute Management Report | Essential | Keep as the primary owner view |
| Finance P&L calculation | Essential | One database function for every reporting surface |
| Payment reconciliation | Essential | Aggregate exact split tenders and compare to Finance net sales |
| Branch performance and reconciliation | Essential | Show branch evidence and consolidated deltas |
| Data trust/completeness strip | Essential | Always show source, freshness, and exceptions |
| Finance Daily P&L | Essential | Keep as detailed evidence behind the owner summary |
| Finance Executive Summary | Consolidate | Use the same periods, labels, P&L, and reconciliation model |
| Sales/POS report calculations | Consolidate | Retain as operational detail; do not let them define a competing P&L |
| Loyalty, WhatsApp, and task signals on Management Report | Consolidate | Keep as secondary signals below core financial controls |
| Formal accounting statements | Archive or hide until supported | Do not imply IFRS/statutory completeness without balance-sheet and cash-flow controls |
| Invented inventory forecasts or health scores | Remove from reporting | Replaced by theoretical stock and count-freshness evidence |

No records or historical features are deleted by this module.

## Dependencies and safe rollout

- `finance_pnl` depends on completed POS orders, product/modifier costs, payroll, approved expenses, cost centers, and shared-allocation policies.
- The payment control reads completed POS orders and preserves split tender components.
- The migration replaces functions only; source records are not updated or deleted.
- The migration is tested inside an explicit transaction and rolled back before live application.
- Application deployment follows database deployment so the new payment function exists before the new bundle requests it.
- Rollback is the prior function definitions from the immediately preceding payroll/finance migrations plus the prior application commit.

## Evidence and remaining Module 1 risks

Automated coverage includes Tripoli period boundaries, P&L normalization, payment and branch reconciliation, unavailable-source behavior, SQL contracts, owner terminology, POS inventory regressions, and loyalty value preservation. All 32 focused tests, targeted lint, the production build, and `git diff --check` passed on the committed source.

Migration `20260731100000` was first executed in a production transaction with contract assertions and rolled back. It was then applied and recorded. For 2026-07-25 through 2026-07-31:

- Payment net sales and Finance P&L net sales both equal 43,333.75 LYD; payment variance is 0.00 LYD.
- Sales, COGS, labor, and shared-cost branch deltas are 0.00 LYD.
- One unallocated expense creates a 2,333.33 LYD consolidated operating-expense difference and the corresponding -2,333.33 LYD profit difference. The report balances this through a visible `Corporate / unallocated` row and separately warns that the expense needs a cost center.
- Seven sold products have no configured cost. The report identifies this explicitly because COGS and profit remain understated until the owner supplies those costs.

GitHub Actions run `30609745944` deployed the application. Authenticated production smoke checks passed on the Management Report and Finance Owner Overview. The report displayed source freshness, completeness warnings, zero payment variance, the balancing row, and branch detail. Arabic used explicit finance terminology with `dir="rtl"`; desktop and a 390×844 mobile viewport were visually checked.

The missing product costs and unallocated expense are business-data remediation items, not hidden software failures. They remain visible owner actions and are not silently repaired because their correct values/classification require business judgment.

## Prioritized backlog outside the active module

These findings are recorded but are not active work:

1. **Module 2 — P0:** reconcile every closed shift’s expected cash with counted cash and every card/Presto batch with settlement evidence.
2. **Module 2 — P0:** consolidate `Sales`, `POSReports`, session reports, refunds, voids, and end-of-day payment definitions around one payment ledger.
3. **Module 2 — P1:** add an explicit reason/owner for every unresolved tender variance.
4. **Module 3 — P0:** make branch inventory scope authoritative; the current theoretical-stock control is explicitly not branch-filtered.
5. **Module 3 — P1:** reconcile purchasing, receipts, transfers, waste, recipe usage, and physical counts into one movement ledger.
6. **Module 4 — P0:** reconcile attendance, schedules, hourly estimates, salary runs, and payroll adjustments.
7. **Module 5 — P1:** measure Loyalty V2 capture, redemption liability, and incremental behavior without exposing customer phone numbers.
8. **Module 6 — P1:** connect Content Studio output to verified campaign and sales outcomes.
9. **Module 7 — P0:** audit owner/staff permissions and complete explicit Arabic terminology instead of relying on broad UI text substitution.
10. **Module 8 — P0:** complete the owner acceptance walkthrough and whole-system reconciliation.
