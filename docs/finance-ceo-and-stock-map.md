# CEO money overview and stock protection

Owner home: `/overview`. Detailed Finance remains at `/finance`. Other staff keep their existing landing routes.

## Money map

| CEO figure | Source | Date / treatment |
| --- | --- | --- |
| Money in | Positive cash tender events and net cash/bank entries in posted journals | Libya business date; actual receipt/settlement date |
| Money out | Cash refunds/voids, paid canonical expenses, other posted cash/bank journal payments (including paid payroll) | Payment date, not invoice upload date |
| Balance | Money in minus money out | Selected period's net movement, not current cash holdings or accounting profit |
| Payroll estimate | Monthly payroll item totals, including drafts; otherwise employee base salary | Prorated overlap days; respects recorded employment dates; never added to actual money out |
| Invoices entered | Canonical `expenses`, including Receipt Snap | Invoice/expense date within the inclusive range; excludes rejected; includes pending/unpaid; full invoice amount |
| Cash and bank balances | Owner observations in `finance_balance_observations` | Closing balances on the selected observation date; edits append evidence |
| Discrepancy | Actual observation minus previous earlier-date observation plus recorded movements | Cash and bank checked independently; first observation establishes the baseline |

Card and Presto are receivables until settlement is recorded into cash or bank. Cash/bank transfers are netted per journal, so they do not inflate money in or out. Daily sales journals and journals corresponding to canonical expenses are excluded from the journal leg to avoid duplication. Opening journals are starting positions, not period receipts. Bank imports alone do not prove a posted settlement. A missing posting produces an unexplained difference for the owner to investigate.

Dates default to the first of the current month through today in Africa/Tripoli. Unknown balances are shown as unknown, not zero. Failed queries clear stale money. Payroll estimates can differ from final payroll and the interface marks missing employee start dates. Manually entered salary expenses are actual payments only; completing a duplicate payroll run still requires the owner's reconciliation.

The existing Finance module retains branch P&L, product profitability, expenses, shared-cost allocation, bank imports, cash position, budgets, capital assets and forecasts. These are supporting accounting/planning views, not extra headline cards on the CEO page.

## Stock map

Owner switch: Products and POS Settings, **Block sales without stock — all branches**. Defaults off. Existing branch-specific stock settings continue to work.

- Canonical stock: `location_product_stock` at the first active branch inventory location.
- Configured sale: a tracked finished product and/or an actual coffee-bean consumption link. A costing-only recipe does not establish physical stock consumption and does not qualify.
- Stock requirements aggregate finished units and coffee grams, including shared bean requirements in an online basket.
- The database rejects missing setup/location/balance, zero/negative stock, and requested quantities exceeding availability. It locks stock rows through the existing sale transaction.
- POS RPCs use the authoritative database `track_inventory` setting, not the client flag. A stale cart or barcode cannot bypass checkout enforcement.
- Online orders are checked on submission and again on completion; pending orders do not reserve stock. Completion consumes tracked products through the canonical movement mirror. Existing coffee consumption and refund/void restoration remain in place.
- Sale ledger writes that would make stock negative fail atomically. Waste and physical count corrections remain possible, including negative discrepancy evidence.
- POS images shade and display a reason, while long press still permits stock receiving. The ordering menu uses the same availability result and checkout guard.
- Every new POS checkout must read the stock policy online. When protection is on, a network failure cannot become a successful offline sale. Old queued sales remain subject to server validation on replay.

## Verification and rollout

Migrations: `20260912100000_ceo_money_overview.sql` and `20260912110000_global_stock_sales_guard.sql`. No stock counts are rewritten and the global switch is not activated by deployment. No balancing journal is created by editing cash/bank observations.

Database regression: `node --test tests/ceo-stock-database.test.mjs` from `apps/pos`, running PostgreSQL through PGlite with the real coffee and movement functions. Browser regression: `npx playwright test --config=playwright.ceo-stock.config.js`. Build and targeted ESLint also required; production schema validation occurs in a rolled-back transaction before application.
