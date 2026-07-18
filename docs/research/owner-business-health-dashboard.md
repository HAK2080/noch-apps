# Owner Business-Health Dashboard — Research Findings

**Date:** 2026-07-17  
**Scope:** Minimum high-level review for a multi-branch cafe/business; weekly, monthly, and custom periods; liquidity with bank and physical cash.

## Conclusion

The minimum useful dashboard is **four review streams**, each filterable by **all branches or one branch** and by a single **weekly/monthly/custom period selector**:

1. **Commercial performance** — are sales and demand healthy?
2. **Profitability and cost** — did the business make money, and why?
3. **Liquidity and obligations** — can it meet near-term payments from bank + cash?
4. **Branch execution** — which branch, shift, product, or control is creating the result?

Add a compact **data-trust/action overlay** to every stream: last refresh, period completeness, reconciliation status, and the top unresolved exceptions. This is a control layer, not a fifth analytics silo.

This structure is an owner-facing management view, not a replacement for formal financial statements. IAS 1’s complete set includes financial position, profit or loss, changes in equity, cash flows, notes, and comparative amounts; the dashboard should preserve those concepts even if it presents a smaller operating summary ([IFRS IAS 1](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements.html/)).

Small-business guidance likewise treats the balance sheet as a point-in-time foundation and calls out available cash, bank reconciliation, payroll, and segment analysis as management basics ([U.S. Small Business Administration](https://www.sba.gov/business-guide/manage-your-business/manage-your-finances)).

## Recommended streams and minimum metrics

| Stream | Minimum metrics | Owner question |
|---|---|---|
| **1. Commercial performance** | Net sales after discounts/refunds; order count; average order value; sales by branch; payment mix (cash/card/other); refunds, voids, and discounts; period-over-period change | Are customers buying more, and where? |
| **2. Profitability and cost** | Net sales; COGS; gross profit and margin; labor cost and labor %; prime cost (COGS + labor) and %; operating expenses; operating profit/contribution; budget or target variance; largest variance driver | Is revenue converting into a healthy contribution? |
| **3. Liquidity and obligations** | Bank balance by account and as-of date; counted cash by branch; total available cash; card/delivery settlements pending; operating cash inflows/outflows and net operating cash flow; cash variance; unreconciled bank/cash amount; obligations due in 7/30 days (payroll, rent, suppliers, tax, debt); runway or cash-floor breach | Can the business pay what is due, without confusing profit with cash? |
| **4. Branch execution** | Sales, orders, AOV, gross margin, labor %, prime cost, cash variance, refunds/voids, stock-outs/waste, and top/bottom product contribution by branch; rank only when data completeness is comparable | Which location or operating driver needs action? |

The three financial lenses answer different questions: P&L is performance over a period, the balance sheet is position at a point in time, and cash flow is liquidity over a period ([Xero’s first-party explanation](https://www.xero.com/us/guides/profit-and-loss-statement/)). Keep these distinctions visible in labels and calculations.

## Period behavior

- **Weekly:** default to the last completed seven-day business week for an owner review; offer week-to-date as explicitly partial. Compare with the immediately preceding equal-length week and show the number of completed days.
- **Monthly:** default to the last completed calendar month; show month-to-date separately. Compare with the preceding month and, when available, the same month last year. Do not compare a partial current month with a full prior month without labeling it.
- **Custom:** accept an explicit start/end date and compare with the immediately preceding period of equal length by default. Show the comparison rule and both date ranges.
- **Flow vs balance:** sales, expenses, labor, orders, and cash inflows/outflows are summed over the selected period. Bank balances, counted cash, receivables/payables, and inventory are **as of the period end**. If a user selects a historical end date, the dashboard must use a historical balance/snapshot or say that only the latest known balance is available.
- **Branch scope:** “All branches” must aggregate branch-level activity plus clearly labelled corporate/unallocated items; a branch view must not silently absorb corporate costs. Multi-location reporting is a standard pattern in first-party POS documentation, including location-specific reporting and separate account/tag handling ([Square multiple locations](https://squareup.com/help/us/en/article/5580-manage-multiple-locations-with-square)).

Comparatives are essential for trend interpretation. IAS 1 requires comparative amounts for the preceding year in a complete annual set; for an owner dashboard, the practical extension is a clearly labelled prior-period comparison for every flow KPI ([IFRS IAS 1](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements.html/)).

## Liquidity design: bank + cash

Show liquidity as a reconciliation, not one editable “cash” number:

```text
Reconciled bank balances (by account)
+ Counted physical cash (by branch/safe)
- restricted/unavailable amounts, if any
= available cash now
+ expected collectible settlements (card/delivery), shown separately
- obligations due in 7 / 30 days
= projected cash after obligations
```

The display should also show:

- **Cash definition:** cash on hand and demand deposits; cash equivalents only if the business actually has them. IAS 7 defines cash as cash on hand and demand deposits, and requires cash flows to be classified as operating, investing, or financing ([IFRS IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/)).
- **Reconciliation freshness:** last bank statement/import date, last completed reconciliation, unreconciled amount, and last physical cash count. Bank reconciliation is the control that checks recorded transactions against the real bank statement; the expected difference is zero after matching, subject to timing items ([QuickBooks reconciliation guidance](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/reconcile-account-quickbooks-online/L3XzsllsK_US_en_US?uid=luy0n1wr)).
- **Cash movement explanation:** operating, investing/CapEx, financing/loan/owner movements, and transfers between branches/accounts. Do not count internal transfers as business inflow.
- **Forecast horizon:** at least the next 30 days for the owner dashboard, with a longer forecast if data supports it. A cash-flow forecast should show inflows, outflows, and the running balance, and should reflect bank timing rather than invoice timing ([Business.gov.uk funding guidance](https://www.business.gov.uk/support/funding-for-business/preparing-for-funding-applications/)).
- **Liquidity alert:** use a configurable minimum cash floor and a short-term obligation coverage flag. “Runway” should be defined as weeks until the cash floor is breached under stated assumptions, not simply cash divided by an opaque burn number.

Banking guidance is useful here as a control principle, not as a cafe regulatory ratio: monitor current and projected liquidity, expected and unexpected cash-flow deviations, critical obligations, and aggregate exposures across systems ([Federal Reserve interagency liquidity guidance](https://www.federalreserve.gov/frrs/guidance/interagency-policy-statement-on-funding-and-liquidity-risk-management.htm)).

## Data-trust overlay and current gaps

The repo’s own finance assessment identifies the main implementation risks: no period-over-period/YoY comparison, no cash-flow statement, no AR/AP aging, manual bank reconciliation, and cash-basis-only reporting ([finance BI assessment](../audit/finance-bi-assessment-2026-06.md)). The dashboard should surface these as limitations rather than imply accounting certainty.

**Assumptions to confirm:**

- LYD is the ledger currency; any USD figure is a clearly marked reference conversion, not a second ledger.
- Local tax, labor, banking, and accounting requirements may differ from the international/US/UK guidance cited here; confirm the applicable Libyan requirements before treating this as a compliance design.
- Physical cash is counted by branch/safe and timestamped; a manual snapshot is not equivalent to a reconciled balance.
- Card/delivery proceeds may be receivables until settled; they are not available bank cash.
- Payroll, rent, tax, supplier, loan, and CapEx commitments have due dates and amounts available to the system.
- Branch-specific and corporate expenses have an allocation policy; otherwise “all branches” profitability is incomplete.
- Product costs, recipe costs, inventory movements, waste, and stock-outs share a trusted mapping before branch margin rankings are treated as actionable.

**Minimum follow-up before calling the dashboard “healthy”:** reconcile POS sales by branch to the finance P&L and GL; reconcile bank imports to statements; reconcile each shift’s expected versus counted cash; add an obligation ledger or AR/AP aging source; and attach completeness/freshness status to every headline number.

## Sources

- [IFRS IAS 1 — Presentation of Financial Statements](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements.html/)
- [IFRS IAS 7 — Statement of Cash Flows](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/)
- [U.S. Small Business Administration — Manage your finances](https://www.sba.gov/business-guide/manage-your-business/manage-your-finances)
- [Business.gov.uk — Preparing for funding applications](https://www.business.gov.uk/support/funding-for-business/preparing-for-funding-applications/)
- [Federal Reserve — Interagency Policy Statement on Funding and Liquidity Risk Management](https://www.federalreserve.gov/frrs/guidance/interagency-policy-statement-on-funding-and-liquidity-risk-management.htm)
- [Intuit QuickBooks — Reconcile an account in QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/reconcile-account-quickbooks-online/L3XzsllsK_US_en_US?uid=luy0n1wr)
- [Xero — How to read a profit & loss statement](https://www.xero.com/us/guides/profit-and-loss-statement/)
- [Square — Create and manage multiple locations](https://squareup.com/help/us/en/article/5580-manage-multiple-locations-with-square)
