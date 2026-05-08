# NOCH POS — Audit summary

**Auditor:** Opus 4.7 · **Date:** 2026-05-06 · Read-only static audit; no app or DB run.

The POS code is well-organised and ships a real flow end-to-end, but it is built as a single-tenant prototype. Before scaling beyond one or two trusted-staff branches, three classes of problem need to be addressed: **server-side authorization**, **transactional correctness**, and **cash-control fundamentals (refunds, audit log, manager override)**. Detailed findings are in `01`–`05`; this is the synthesis.

---

## Top 5 risks (ranked)

| # | What | Why it matters | Where | Fix size |
|---|---|---|---|---|
| 1 | **RLS policy is `using (true)` on every POS table.** All authorization is client-side. | A barista (or anyone with the anon key + a sign-up) can read all branches' orders, edit prices, void orders, and rewrite shift totals to hide a cash skim. This is the largest single risk. | [`supabase/migrations/20260413100000_pos_system.sql:117-132`](supabase/migrations/20260413100000_pos_system.sql:117) | **M** — write per-table policies scoped to a `staff_branches(user_id, branch_id)` table; lock writes to RPCs where audit is needed. |
| 2 | **Order creation is non-atomic, non-idempotent, race-prone.** 4 sequential writes; `order_number` derived from `count(today)+1` with no UNIQUE constraint; stock and shift totals use read-modify-write. | Concurrent terminals can mint duplicate order numbers. A double-tap on Charge can double-charge. Concurrent sales lose stock decrements and shift-total updates → cash variance at EOD baked in by design. | [`pos-supabase.js:304-416`](src/modules/pos/lib/pos-supabase.js:304) | **M** — wrap in a `create_pos_order` Postgres function (single transaction); add `idempotency_key uuid unique` on `pos_orders`; use `SELECT … FOR UPDATE` for stock; atomic `UPDATE … SET col = col + n` for shift totals; add `UNIQUE(branch_id, order_number)`. |
| 3 | **End-of-day has no lock and no reconciliation.** `closeShift` doesn't check status; sales can land between Z-print and close; shift totals are trusted over a sum of `pos_orders`. | Printed Z-report and cash drawer will systematically disagree, and you won't know which one to trust. | [`POSEndOfDay.jsx`](src/modules/pos/pages/POSEndOfDay.jsx), [`pos-supabase.js:242-288`](src/modules/pos/lib/pos-supabase.js:242) | **S** — guard `closeShift` with `where status='open'`; add a `closing` intermediate state that blocks new orders to that shift; reconcile totals against `sum(pos_orders.total)` and surface diffs. |
| 4 | **Offline → online sync corrupts the ledger.** No client UUIDs, no idempotency, server re-numbers offline receipts so the printed slip can't be matched to the persisted row. Two devices flushing concurrently is undefined. | Customers walking back with an `OFFLINE-3` receipt cannot be looked up. Sync re-run after a reload duplicates orders. Stock decrement happens against current stock, not stock-at-time-of-sale. | [`pos-sync.js`](src/modules/pos/lib/pos-sync.js), [`POSTerminal.jsx:281-291`](src/modules/pos/pages/POSTerminal.jsx:281) | **L** — generate client UUID at cart-charge time; persist `client_id`, `client_created_at`; preserve the offline `order_number` server-side or print a deterministic one client-side; dedupe in the create RPC. |
| 5 | **PIN gate is cosmetic and there is no audit log.** Verified PIN profile is discarded; orders don't carry a `served_by`; "Skip (Owner Mode)" bypasses entirely; PINs use a static client-side salt and are never rate-limited. | Nobody can tell who rang the order, who voided it, or who applied the discount. With #1 above, voids/edits go unattributed and undetectable. | [`POSPinLogin.jsx`](src/modules/pos/pages/POSPinLogin.jsx) + [`POSHome.jsx:117`](src/modules/pos/pages/POSHome.jsx:117) | **S** — thread the verified profile via context; record `served_by` on every order, void, and shift action; add a `pos_audit_log` table; remove the Skip button or gate it on `isOwner`; per-user salt + rate limit on PIN verify. |

## Top 5 missing features (blocking scale)

| # | Feature | Why it blocks scaling |
|---|---|---|
| 1 | **Refunds (full and partial) + order lookup UI.** | Cafés generate refunds daily. Schema flips status but doesn't reverse stock/shift/loyalty; there's no UI to find an order anyway. |
| 2 | **Manager override flow.** | Discounts >10%, voids, and refunds need an approval pattern. Today the cap simply blocks; a barista can't escalate without a second login. |
| 3 | **Per-barista shift + cash-in/out movements.** | Per-branch shift means multiple staff share one ledger; petty cash and tip-out cannot be recorded. Real-world cash variance always blames "the shift," not the person. |
| 4 | **Out-of-stock blocking + sold-out toggle in terminal.** | Out-of-stock items can be sold (decrementing past zero, no warning). The `is_sold_out` flag exists at the schema level but has no terminal UI. |
| 5 | **Reporting beyond a single Z-report.** | No weekly/monthly, no by-product, by-barista, by-hour, no week-over-week. Owner can't see the business. `getDailySales` exists in code with no consumer page. |

## Top 5 quick wins (<1 day each, materially helpful)

1. **Switch `pos_orders.order_number` to a Postgres sequence + UNIQUE constraint, generated inside an RPC.** Eliminates duplicate-number risk immediately, even before broader transaction work.
2. **Disable Charge while the request is in flight, and add a UUID-based idempotency key.** Two-line change in `POSTerminal.handlePaymentComplete`; cuts double-charge risk dramatically.
3. **Remove "Skip (Owner Mode)" or gate it on `isOwner`.** One-line fix; closes a wide-open bypass.
4. **Set ESC/POS code page to CP1256/CP864 and verify Arabic receipt rendering on the actual XPrinter.** ~10 lines in `escpos.js`. Arabic on receipts has likely been broken since launch.
5. **Add an order-search page** (`/pos/:branchId/orders` listing today's `pos_orders` with reprint button). The DB has the data; the UI is missing. Unlocks reprints, refunds-by-lookup, and cashier self-service for "I lost my receipt."

## Three questions before any fix work begins

1. **Is Presto actually settled by card or by aggregator transfer?** If the latter, lumping Presto into `total_card_sales` will overstate Verifone settlement every day. (Pass 2 C4.) The fix differs depending on the answer.
2. **Are receipts in Arabic actually printing legibly today on the XPrinter NP-N200L,** or have you been living with garbled characters? (Pass 2 D2 / Pass 5 receipts section.) This changes whether the printer fix is "set code page" or "render bitmap."
3. **What's the desired money precision policy: 2-dp displayed and stored, or 3-dp millims?** Today: 3-dp in DB, 2-dp on receipt and modal. (Pass 2 A2.) Pick one — every other money fix follows from this.
