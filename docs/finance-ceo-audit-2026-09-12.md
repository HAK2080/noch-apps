# CEO money audit — September 12, 2026

Agent: Codex. Read-only production audit of September 1–12, using Africa/Tripoli date boundaries. Figures verify the recorded data; bank statements and physical payment evidence were not independently reconciled.

## Recorded money

| Item | LYD |
| --- | ---: |
| Cash sale tender events | 26,005.50 |
| Net cash-to-card/payment-method corrections | -1,084.00 |
| Corrected money in | 24,921.50 |
| Paid expense documents | 8,734.50 |
| Actual cash refund events | 259.00 |
| Corrected money out | 8,993.50 |
| Net movement | 15,928.00 |

The old overview classified negative cash payment corrections as payments and positive corrections as new receipts. Negative corrections totalled 1,274 LYD and positive corrections 190 LYD. Moving the 1,274 from money out to a reduction of money in fixes the presentation without changing the balance or financial records. Correction dates remain their recorded dates; a correction-only period can have negative receipts.

All 15 paid expense documents match their posted cash/bank journal amounts: 11 cash payments totalling 7,565 LYD and four bank payments totalling 1,169.50 LYD. None has a missing payment date/account. No legacy expense_entries payments fall in this period. The 11 cash refunds link to orders and total 259 LYD. No reconstructed tender events occur in the period. These checks validate recorded amounts, not whether every real-world payment was entered correctly.

The invoice total is 9,134.50 LYD across 16 documents: paid 8,734.50 plus an approved, reported-unpaid 400 LYD cake invoice dated September 5. A different 400 LYD cake invoice dated September 7 is marked paid and has a different receipt URL; similar descriptions warrant receipt review, not automatic deletion or settlement.

## Month-end forecast readiness

- September has no payroll run. Active employee base salaries sum to 25,000 LYD; September 1–12 accrual estimate is 10,000 LYD. Final payroll can differ through overtime, bonuses, deductions and staffing changes. August's owner-confirmed 32,460 LYD cash payment remains in August, not September.
- No active recurring expense templates exist. Fixed-cost settings for rent, utilities and other costs are all zero, which is missing setup, not evidence of no costs.
- Rent history is ambiguous: a 3,200 LYD Rent-category payment dated August 18 and a 60,000 LYD July 6 payment described as branch rent but classified Food & Beverages. Neither has an explicit coverage start; do not infer a monthly amount or repeat either payment automatically.
- Earlier approved documents include 81,284.40 LYD across 124 records with payment status not reported, some dated 2020, plus 900 LYD explicitly reported unpaid. Exclude unknown historical statuses from a confident current forecast; review them separately.
- Recommended single CEO card: **Expected payments by month-end**, covering remaining payroll, confirmed unpaid bills (including overdue), and scheduled recurring costs, subtracting payments and linked bills once. Show **incomplete** when amounts, due dates or payment status are missing. Keep cost details behind an optional link.
- The immediately identifiable planning subtotal is 25,400 LYD for September estimated salaries plus its unpaid invoice; adding 900 LYD explicitly unpaid older bills gives 26,300 LYD before rent/other costs, subject to payment-status and receipt confirmation. This is not a complete forecast.

The 40,000 LYD cash and zero bank observation dated September 12 is the owner's first entered baseline. The 15,928 LYD top-card balance is period movement, not cash available. A later closing observation is needed to check recorded movements against another actual balance.

## Owner clarification after the audit

The owner confirmed that **all scanned invoices have already been paid**. This supersedes the planning assumption above for the scanned 400 LYD September invoice and 900 LYD August invoice: they are not expected future payments. A follow-up production query identified 18 approved scanned receipts totalling 9,385.50 LYD without posted payment details (16 not reported, two reported unpaid). Their payment accounts and dates must be established before posting settlements. Five have suspicious dates: four in 2020/2021 and one in 2027. Other scanned invoices already marked paid also have historical/future dates that merit receipt review. Rejected scans remain excluded from automatic settlement. The owner was asked for the missing payment methods/date rule; no payment details were invented or financial transactions changed.

## Final scanned-invoice settlement

The owner subsequently instructed **cash assumed; use the system entry date, not the date printed on the receipt**. Applied that instruction to the 18 approved scanned invoices missing settlement entries, totalling 9,385.50 LYD, using `(submitted_at at time zone 'Africa/Tripoli')::date` for `paid_at`. Kept already-posted settlements and rejected scans unchanged. Original invoice dates were not rewritten.

The operation used the existing audited `mark_expense_paid` function, guarded the expected count/amount and business funding, locked each invoice, and updated payment declarations to paid/cash. Payment notes retain the owner's cash/date assumption; reference `owner-scan-cash-2026-09-12`. A production rollback rehearsal and the committed operation both returned zero journal mismatches. Recorded payments: July 8,085.50 LYD, August 900 LYD and September 400 LYD.

| System entry/payment date | Count | LYD |
| --- | ---: | ---: |
| 2026-07-25 | 6 | 5,055.50 |
| 2026-07-27 | 4 | 1,085.00 |
| 2026-07-29 | 2 | 1,415.00 |
| 2026-07-30 | 4 | 530.00 |
| 2026-08-20 | 1 | 900.00 |
| 2026-09-05 | 1 | 400.00 |

Final September 1–12 figures after the owner's payment reconciliation: money in 24,921.50 LYD, money out 9,393.50 LYD, net movement 15,528.00 LYD. All 16 September invoices (9,134.50 LYD) are now paid; 259 LYD cash refunds make up the rest of money out. The 40,000 LYD user-entered cash observation is preserved. The forecast must no longer include the scanned 400/900 LYD as outstanding; 25,000 LYD base payroll remains an estimate and rent/regular bills still need confirmed amounts and due dates.

## Reporting change and checks

Migration `20260912120000_ceo_payment_correction_reporting.sql` replaces only the reporting function; the separate owner-authorized settlement above changes payment records. CEO card descriptions identify corrected receipt methods and actual cash refunds. PostgreSQL tests cover both correction directions, paired card corrections, real refunds, Libya midnight boundaries, correction-only periods, unchanged net movement and existing owner access controls.
