# Finance and Accounting workflow audit — 12 September 2026

Agent: Codex. Scope: source tracing and read-only production SQL inspection. No posting, payments, syncs, imports or financial corrections were executed. This is an engineering workflow audit, not an assurance opinion on the accounts.

## Production evidence

- Automatic GL posting is off; last_synced_date is 2026-07-31.
- Posted journals dated 2026-08-01 onward contain only the expense source: 137 batches. No sales_daily or payroll batches in that window. The latest expense journal date is 2026-11-08; future dates need review, not automatic correction.
- All 334 paid expense records have a posted expense journal by source reference. Zero posted journals have debit/credit differences above 0.005 LYD.
- 104 paid expenses have a journal date different from paid_at. This requires classification of intended accrual versus settlement dates before repair.
- 108 paid expenses lack payment_journal_batch_id, despite a source-reference journal existing. These are broken/missing links, not missing journals.
- Across expense history: 107 paid bank expenses, 109 approved unpaid expenses, and 157 paid expenses with payment date different from invoice date.
- No bank transactions have been imported.
- August payroll remains a 26,900 LYD draft. The previously recorded 32,460 LYD actual payroll expense remains a separate workflow; the 5,560 LYD difference must be explained before completing that draft.

## Workflow map and findings

| Flow | Existing route | Finding / next action |
|---|---|---|
| Sales | POS orders -> Finance reporting; Accounting gl_sync_period -> gl_post_sales_day -> daily GL batch | Production posting stops at July. Repair posting logic before backfilling August onward. |
| Refunds | Order refund totals -> daily sales GL | Current live GL function credits every refund to cash and attaches it to the original order day. Use refund event date and actual tender; review historical impact. |
| Expense payment | mark_expense_paid -> dated cash/bank journal + expense payment metadata | Explicit payment path exists, but period sync calls an older replacement function. |
| Expense period posting | gl_sync_period -> gl_post_expense | Live function deletes the existing journal and reconstructs it using expense_date; ordinary funding credits cash, ignoring payment_account_key. It also accepts approved unpaid expenses. This can overwrite correctly dated bank settlements or record unpaid bills as cash out. Do not repair data by blindly running Post period. |
| Supplier invoice | Procurement receipt -> inventory debit / supplier payable credit; payment -> payable debit / cash or bank credit | Separate receipt/payment stages exist. Repository payment RPC uses full order cost, with no partial-payment amount. Introduce payment allocations rather than creating a second unrelated expense for the same invoice. |
| Payroll | Draft -> completion RPC -> wages expense/payable and loan recovery; separate payroll_record_payment_v2 settlement RPC | Backend separation exists, but no caller of the payment RPC was found in apps/pos/src. Wire an explicit payment action and reconcile the standalone August payment before approving the draft. |
| Bank | CSV import -> bank_transactions -> category and reconciled flag | Reconciled toggle writes a boolean without matching evidence. Add journal/payment matching and statement control totals. |

## Additional confirmed implementation risks

1. Bank importer conflict target uses plain description, but the live unique index uses COALESCE(description, ''). PostgreSQL index inference will not match that target. Fix and test repeat imports, blank descriptions and valid zero balances. The parser also silently substitutes today's date for invalid/missing dates.
2. Several Accounting list queries swallow errors and return empty arrays, so a failed journal request can display “No journal entries.” Show a retryable failure and distinguish it from an empty period.
3. Journal listing stops at 200 without pagination. Add pagination/total count so review does not silently omit records.
4. Sales COGS posting uses current product/modifier costs rather than sale-time costs. Reposting an old day after changing costs can change historical profit. Capture cost evidence and treat returns explicitly.
5. Both sales and expense posting delete/recreate batches. Preserve posted history using controlled reversals/corrections and introduce period-close controls after reconciliation.

## Suggested repair sequence

1. Correct sales/refund and expense posting with meaningful database tests: bank versus cash, unpaid bills, differing dates, refund tender/date, repeat execution, and branch scope.
2. Produce a read-only proposed historical correction report, including date/account changes and missing sales periods. Review future-dated records and payroll difference before posting corrections.
3. Repair bank import and introduce evidence-based reconciliation.
4. Connect payroll payment UI; add supplier partial payments and invoice/payment links.
5. Add visible posting coverage/errors, then month-end close and locking.

## Source references

- apps/pos/src/modules/accounting/lib/accounting-supabase.js
- apps/pos/src/modules/accounting/AccountingDashboard.jsx
- apps/pos/src/modules/finance/lib/finance-supabase.js
- apps/pos/src/modules/finance/tabs/BankTab.jsx
- apps/pos/src/modules/finance/tabs/PayrollTab.jsx
- supabase/migrations/20260613030000_gl_posting_rpcs.sql
- supabase/migrations/20260615010000_accounting_expense_procurement_workflow.sql
- supabase/migrations/20260718180600_p0_gl_reports_presto.sql
- supabase/migrations/20260719170000_shareholder_funding.sql
- supabase/migrations/20260731230000_workforce_control_v2.sql

Production pg_get_functiondef confirmed gl_post_sales_day, gl_post_expense and gl_sync_period match the audited legacy paths. Live pg_indexes confirmed the bank deduplication index. No financial writes or full transaction simulations were needed for this read-only audit. Historical balance correctness and individual supplier transaction evidence still require reconciliation; balanced journals alone do not establish correctness.
