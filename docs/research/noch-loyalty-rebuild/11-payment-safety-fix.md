# Payment safety fix — live 12 September 2026

## What changed

Incoming menu orders now open **مراجعة وتحصيل الدفع** (review and collect payment). The cashier reviews the items, chooses cash/card/split, enters the amount and explicitly confirms receipt. An open shift is required. Preparation printing starts only after payment is saved.

The server completes the existing order in one transaction: payment proof, order status, stock, tender accounting, existing loyalty settlement and shift totals succeed together or roll back together. Retrying the same completed payment does not charge, award points, deduct stock or print again. Already-preparing legacy orders do not get a second preparation ticket.

Only active authorised staff for the branch can complete or cancel orders. Old approval/collection shortcuts cannot bypass payment. Unpaid orders can be cancelled; paid orders must use the refund workflow. Technical failures show actionable Arabic guidance.

## Customer-value protection

No historical customer balances, orders or stock were rewritten. Existing loyalty settlement remains enabled; reward rules were not rebuilt. Synthetic tests cover base-point rounding, payment retries, failed-payment rollback and refund/void preservation. This is not certification of every reward or mission rule.

The double-stock deduction was reproduced using repository SQL. Live inspection found an older pickup function without that extra movement; we did **not** establish historical double deductions in production. The new single stock path replaces both variants without attempting historical repairs.

## Release evidence

- Explicit owner approval: “Yes, apply live.”
- Code: `efff7c684a0520135ceb9f8dd98f56b6b5909a21`.
- Database: `20260912170000_online_order_payment_safety.sql` applied successfully through the authenticated Supabase SQL editor. Do not rerun or edit this applied migration.
- [Production deployment 34679831635](https://github.com/HAK2080/noch-apps/actions/runs/34679831635): successful, 12 September 2026, 07:08 UTC.
- Live assets: `/assets/index-SyjCG8xx.js` contains the new payment RPC; `/assets/pos-messages-CqL6o59S.js` contains the Arabic payment labels.
- Live metadata: completion/approval/collection/cancellation RPCs deny anonymous execution; authenticated execution still checks staff and branch internally. Payment guard, stock guard, three tender triggers and existing loyalty settlement trigger are enabled. PostgREST schema cache refreshed.
- Verification: 18 isolated actual-SQL tests; 26 other targeted Node checks; 6 payment, 7 Arabic and 16 journey browser tests; targeted lint, production build and whitespace checks passed. Some journey tests intentionally document remaining gaps.
- Arabic payment screenshot visually checked. No production test sale, customer account, payment, OTP or print message was created.

## Staff action and remaining work

Refresh the cashier tablet before using the new payment flow. If payment succeeded but printing failed, check the saved order and printer; do not collect payment again. Replays deliberately do not automatically reprint.

This completes the payment/stock safety slice, **not the full two-tablet journey**. Still required: customer-display QR routing and privacy reset, profile/prize/progress experience, QR expiry/phone fallback defects, guest-submission duplicate protection, server-side missing-GPS checks and menu feedback-link correction. The new review dialog displays existing items; it does not yet edit menu customisations.

Physical Android tablets, printer and a controlled end-to-end sale still need an on-site trial. Isolated SQL tests are not a multi-connection production concurrency test.
