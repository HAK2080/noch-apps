# CEO cash forecast

The CEO overview separates recorded cash movement from a saved plan for the rest of the current month.

- When the selected dates include today, the top **Money in** and **Money out** cards include actual recorded totals plus saved expected incoming/payments through the forecast target. **Projected net balance** is their difference: green above zero, red below zero, neutral at zero. The card excludes starting cash; cash left after payments below still uses starting funds.
- Historical ranges excluding today show actual recorded totals and **Net cash change**, without the current forecast.
- Unsaved forecast changes hide projected totals until Calculate & save succeeds. Loading or save errors also prevent stale projected figures.
- **Invoices dated in this period** uses the invoice date, not its upload date.
- **Plan the rest of this month** has its own forecast-through date, from today to month-end. Its calculation does not use the historical date filter.
- Use **＋ Add expected item** for lease, security, bills or expected receipts. Select incoming (+) or payment (−), enter a positive LYD amount and expected date, and include or exclude it. Remove deletes the planning item only.
- **Calculate & save forecast** stores the monthly plan for the owner account. It does not create an expense, salary payment, journal or balancing entry.
- Starting funds use the latest entered cash/bank closing count, plus recorded cash/bank movements on later dates through today. Without a count, cash left remains unknown. A count for today must be a closing count; update it after today's transactions are recorded.
- Expected payments and incoming include enabled items due on or before the forecast date, including overdue items. Items dated after it remain saved but do not contribute.
- Cash left = starting funds + expected incoming − expected payments. This is a planning scenario, not profit or a bank reconciliation.
- Payroll is initially suggested from the month's payroll estimate, unless the month's payroll run is already marked paid. Review separately recorded payroll payments/advances. Once saved, payroll is an editable planning assumption; it is not silently replaced when payroll changes.
- Exclude/remove items as they are paid or received to prevent double-counting against refreshed actual funds. The planner does not automatically match manual items to accounting records.
- Lease/rent and other bills remain flagged until the owner confirms they are covered, already paid or not due. Checkboxes record review, not proof of completeness.
- Plans are separate by calendar month. Prior plans are retained in the database; the editor opens the current month. Recurring items do not automatically repeat.

August's 5,560 LYD draft/payroll-payment difference still requires the owner's allocation explanation before changing payroll. A later actual closing cash/bank count is required before recording another reconciliation observation. No amounts or dates have been invented for either.

Verification: 14 database checks, five browser tests, targeted ESLint and production build passed. Production save arithmetic was checked in a rolled-back transaction: 40,000 − 32,460 − 2,000 + 5,000 = 10,540 LYD. Temporary test items were not retained.
