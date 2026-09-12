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

## Change and checks

Migration `20260912120000_ceo_payment_correction_reporting.sql` replaces only the reporting function. No transactions or payment statuses are edited. CEO card descriptions identify corrected receipt methods and actual cash refunds. PostgreSQL tests cover both correction directions, paired card corrections, real refunds, Libya midnight boundaries, correction-only periods, unchanged net movement and existing owner access controls.
