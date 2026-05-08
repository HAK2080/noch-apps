# Pass 2 — Correctness audit (money, state, data)

Severity legend: **🔴 critical** (data loss / silent miscount / money loss), **🟠 high**, **🟡 medium**, **🟢 minor / cosmetic**.
File:line refs are the primary evidence. "**SAME-PRINTED**" means cart UI, receipt-modal preview, ESC/POS print, and DB row come from the same arithmetic; "**DIVERGES**" means at least one is recomputed independently.

## A. Money math

### A1. 🔴 All POS arithmetic uses native JS floats
Every code path multiplies/sums prices with `parseFloat` and the `+`/`*` operators:
- [`POSTerminal.jsx:251`](src/modules/pos/pages/POSTerminal.jsx:251) `subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)`
- [`CartPanel.jsx:100`](src/modules/pos/components/CartPanel.jsx:100) `subtotal = items.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0)`
- [`escpos.js:126`](src/modules/pos/lib/escpos.js:126) `(parseFloat(item.unit_price) * qty).toFixed(2)`
- [`pos-supabase.js:337`](src/modules/pos/lib/pos-supabase.js:337) `total: item.unit_price * item.quantity` (sent to DB)
- [`pos-supabase.js:691-697`](src/modules/pos/lib/pos-supabase.js:691) daily-sales totals also reduce floats.

LYD prices are stored as `decimal(10,3)` server-side, so menu prices like 14.500 round-trip cleanly today. But discounts and split-payment cash legs are computed in JS and inserted as floats — `subtotal * 0.10` for a 19.50 LYD subtotal is `1.9500000000000002`, persisted via PostgREST cast. A 5% line discount on 0.1+0.2 style sums will silently desync from any receipt that re-rounds.

### A2. 🟠 Rounding happens in three places with no shared helper
- Cart UI: `(price * qty).toFixed(2)` per line ([`CartPanel.jsx:35`](src/modules/pos/components/CartPanel.jsx:35)) and `subtotal.toFixed(2)` for total.
- Receipt preview: `parseFloat(order.total).toFixed(2)` ([`ReceiptModal.jsx:100`](src/modules/pos/components/ReceiptModal.jsx:100)).
- Printer: `parseFloat(item.unit_price).toFixed(2)` line, `parseFloat(order.total).toFixed(2)` total ([`escpos.js:125`](src/modules/pos/lib/escpos.js:125)). Notice `.toFixed(2)` truncates `decimal(10,3)` prices — 14.575 LYD prints as **14.58** but the row in DB stores 14.575. Bank-style banker rounding is not used.
- DB: stored as `decimal(10,3)`. `total = subtotal - discount_amount` is computed in JS and sent.

The customer-facing receipt prints **2 decimal places**; the system stores **3**. Any LYD price ending in `xx5` rounds inconsistently between display and ledger. Libyan currency is in `1/1000`-dinar millims; cafés routinely use 3-dp pricing. This must be reconciled before scaling.

### A3. 🟠 Displayed total can disagree with persisted total
[`POSTerminal.handlePaymentComplete:251-263`](src/modules/pos/pages/POSTerminal.jsx:251) recomputes `subtotal` and `total` from the cart, ignoring the values that `CartPanel` already passed in via `chargeData`. The two computations should agree — but the `discountAmount` cap logic in `CartPanel` (10% cap for non-managers) is **not** re-applied in `POSTerminal`. A manager-tier user opens the discount panel, then a non-manager submits → no enforcement. (In practice the same user is both, but role-switch in-shift is a real flow at handoff.)

### A4. 🟠 Order item totals computed twice with divergent precision
- Cart sends `total: i.price * i.quantity` (float) to `handlePaymentComplete` ([`POSTerminal.jsx:272`](src/modules/pos/pages/POSTerminal.jsx:272)).
- `createPOSOrder` discards it and recomputes `total: item.unit_price * item.quantity` ([`pos-supabase.js:337`](src/modules/pos/lib/pos-supabase.js:337)).
Result: same answer today (both are pure JS multiplication), but anyone adding modifiers, line-discounts, or per-item promos will need both sites updated. **Single source of truth missing.**

### A5. 🟡 No tax line on receipt, even though receipts say "TOTAL"
Libya has no VAT today. The schema has no `tax_amount`. Adding tax later means a migration, a new column, and edits to four files (cart, payment, receipt, printer). Future-proofing: noted in Pass 5.

### A6. 🟡 `Math.max(0, subtotal - discountAmount)` is the only floor
[`CartPanel.jsx:113`](src/modules/pos/components/CartPanel.jsx:113) clamps total to 0. `createPOSOrder` does NOT — it stores `total = subtotal - discount_amount` raw. If you open a 100% flat discount (manager allowed) on an empty cart edge case, `total` could be negative in DB. Low risk because charge button hides at empty cart, but the DB has no `CHECK (total >= 0)`.

## B. Discount and modifier logic

### B1. 🔴 Modifiers don't exist
There is no modifier system: no `pos_modifiers` table, no UI in `CartPanel` or `ProductGrid`, and `cart.notes` is initialized to `''` and never user-editable. For a coffee shop with milk swaps, syrup add-ons, sugar levels, and size variants this is a critical product gap, not a bug. Filed in Pass 5 as well.

### B2. 🟠 Discount can apply to a refund (when refunds exist)
There is no refund flow at all (Pass 5), but if added naively `voidPOSOrder` ([`pos-supabase.js:436`](src/modules/pos/lib/pos-supabase.js:436)) only flips status and does not reverse stock decrement, shift totals, or loyalty. Any future refund implementation will need to walk all four side-effect tables.

### B3. 🟡 Percentage-discount cap can be bypassed via flat
[`CartPanel.jsx:107-110`](src/modules/pos/components/CartPanel.jsx:107) caps non-manager flat discounts at 10% of subtotal. Cap is only enforced **in CartPanel render** — server has no `CHECK` on `discount_amount`. A user with browser devtools (or another role-permission writer) can submit any discount the API will accept.

### B4. 🟡 100% discount + cash payment = sale with cash_tendered = 0 valid
[`PaymentModal.jsx:58-62`](src/modules/pos/components/PaymentModal.jsx:58) `canComplete` for cash requires `cashTendered >= total`. With total=0 any tender passes including 0. Order persists. Probably fine for "free comp" flows but no audit trail captures *why* total=0 (no comp_reason field).

### B5. 🟡 `discount_pct` only stored when `discountType === 'pct'`
[`POSTerminal.jsx:260`](src/modules/pos/pages/POSTerminal.jsx:260). A flat discount stores `discount_pct: 0` even when the implied percentage is meaningful (5 LYD off 50 LYD = 10%). Reporting that wants "average discount %" can't compute it from the row.

### B6. 🟢 Discount UI default is 10%
[`CartPanel.jsx:97`](src/modules/pos/components/CartPanel.jsx:97). Defaulting the **value** to 10 when toggling % feels right, but if the user types nothing and clicks Apply, 10% applies silently. Low harm because the cart total updates live.

## C. Payment flows

### C1. 🔴 Payment failure mid-transaction is not handled
[`POSTerminal.handlePaymentComplete:277-299`](src/modules/pos/pages/POSTerminal.jsx:277). If `createPOSOrder` throws after the order row is inserted (e.g. items insert fails), the `pos_orders` row stays. The user sees an error toast and may charge again, creating a duplicate `pos_orders` row + items + double stock decrement. No idempotency key, no client-generated UUID.

### C2. 🔴 Receipt printed without persisted order is possible (and vice versa)
The print step happens in `ReceiptModal` after `setShowReceipt({order, items})`. The order is already in DB at that point, and the user can dismiss without printing — fine. **But** in offline mode ([`POSTerminal.jsx:281-291`](src/modules/pos/pages/POSTerminal.jsx:281)) a fake `offline-${id}` order is shown, customer gets a printed receipt with order number `OFFLINE-N`, and on sync the order is created with a **different** server order number. The receipt the customer holds is unverifiable.

### C3. 🟠 Split payment math: card share rounded, cash inferred
[`pos-supabase.js:381-387`](src/modules/pos/lib/pos-supabase.js:381). `cashAmt = total - card_amount` for split. If `card_amount = 9.55` and `total = 19.99` (paid 9.55 card, 10.44 cash), float subtraction is fine here, but the **Z-report cash sales** line is computed by `getDailySales` as `sum(total) - sum(card_amount)` filtered to `cash` and `split` rows — drift is cumulative across hundreds of orders.

### C4. 🟠 Presto is treated as card
[`pos-supabase.js:379-387`](src/modules/pos/lib/pos-supabase.js:379) and [`escpos.js:161-163`](src/modules/pos/lib/escpos.js:161). Presto is a delivery aggregator — it normally settles by bank transfer, not in-counter card. Lumping it into `total_card_sales` will overstate card receipts vs Verifone EOD totals. **NEEDS_MANUAL_VERIFY** with the operator on how Presto settles.

### C5. 🟠 No receipt of delivery batch / no refund tie-back
Presto orders fire-and-forget; if Presto rejects later (rider cancels) there is no refund flow.

### C6. 🟡 Cash tendered can be 0 for cash method when total > 0 (pre-fill)
`cashTendered` initial state is `total.toFixed(2)` ([`PaymentModal.jsx:42`](src/modules/pos/components/PaymentModal.jsx:42)). User can overwrite to 0 then numpad-add. If they click Complete with cashTendered < total, button is disabled — OK. But the numpad's `value === '0' ? k : value + k` rule means typing `5` after Backspace-to-zero produces `5`, not `05` — fine, just confirming.

## D. Receipt content (modal vs ESC/POS)

| Field | Modal (`ReceiptModal.jsx`) | Printer (`escpos.js`) | Match? |
|---|---|---|---|
| Header | `branch.receipt_header || branch.name` | same | ✓ |
| Date/time format | `en-GB` short date, `HH:MM` | same | ✓ |
| Order number | `#${order.order_number}` | `Order: ${order.order_number}` | label diverges, value same |
| Items | `qty x unit_price.toFixed(2)` | `qty x price` then total | both `.toFixed(2)` ✓ |
| Subtotal | `parseFloat(order.subtotal).toFixed(2)` | same | ✓ |
| Discount | shown if `> 0` | same | ✓ |
| **Total** | `.toFixed(2)` | same, doubled-size | ✓ |
| Cash tendered/change | both shown | both shown | ✓ |
| Split breakdown | **NOT shown on screen** | shown | ❌ DIVERGES |
| Presto note | **NOT shown on screen** | shown | ❌ DIVERGES |
| Footer | `branch.receipt_footer` (RTL) | same, but Arabic glyphs likely won't render on XPrinter without code-page setup | risk |
| Payment method label | not shown on modal | `Payment: METHOD` | ❌ DIVERGES |
| Tax line | none | none | n/a |

🟠 **D1.** The on-screen receipt does not show split-payment breakdown, Presto label, or payment method. Customer who only sees screen (e.g. printer offline) loses information.

🔴 **D2.** Arabic footer is sent as raw UTF-8 bytes ([`escpos.js:74`](src/modules/pos/lib/escpos.js:74) `new TextEncoder().encode(text)`) without an ESC/POS code-page command (`ESC t n`). Most XPrinter NP-N200L units default to CP437 / WPC1252; Arabic glyphs print as garbage. **NEEDS_MANUAL_VERIFY** on actual printer — the receipt may have been showing nothing or boxes for the Arabic line all along.

🟡 **D3.** No order number barcode/QR on the receipt, so refund lookup means typing 14 chars by hand.

🟢 **D4.** Receipt always shows `LYD` regardless of `branch.currency` column (which exists but is ignored).

## E. End-of-day Z-report

[`POSEndOfDay.jsx`](src/modules/pos/pages/POSEndOfDay.jsx) + [`pos-supabase.getShiftSummary:257-288`](src/modules/pos/lib/pos-supabase.js:257):

* Sums come from **two sources**: `pos_shifts.total_*` columns (live-incremented during sales — see G1 below) AND `pos_order_items` (re-fetched for top-products).
* Z-report displays `shift.total_sales`, `shift.total_cash_sales`, `shift.total_card_sales` directly. **No reconciliation** with sum(`pos_orders.total where shift_id=…`).
* If the shift counter desyncs from the orders (concurrent writes — see G1), the Z-report and the orders table will disagree, and you won't notice.

🔴 **E1.** Running EOD twice has no guard. `closeShift` updates the row regardless of current status. Operator could close a shift, sell more (terminal still loaded), close again — second close overwrites `closing_cash` and `cash_difference`. No `WHERE status='open'` guard in `closeShift`.

🔴 **E2.** No day-close lock. A new sale arriving (offline sync, online order, second terminal) **after** EOD has been printed but **before** `closeShift` is called will be added to the shift's totals and not appear on the printed Z-report. **Cash drawer count vs Z-report drift guaranteed under any concurrency.**

🟠 **E3.** Z-report doesn't break down by hour, by barista, by void/refund category, or list discounts given. Operator can't audit unusual activity.

🟠 **E4.** `summary.topProducts` aggregates by `item.product_name` (text) — two products with the same name across categories collapse together.

🟡 **E5.** Z-report is printable but not stored. If the printer is out, no PDF/HTML fallback.

## F. Idempotency

🔴 **F1.** **No idempotency anywhere in the order pipeline.** A double-tap on Charge → two sales. A retry after a 504 → two sales. An offline queue that gets two sync runs (page reload during sync) → two sales per offline order. No client-generated UUID, no server-side dedupe, no `idempotency_key` column on `pos_orders`.

🟠 **F2.** Charge button is not disabled while `handlePaymentComplete` is in flight. Quick second-click before async resolves = duplicate request.

🟠 **F3.** Loyalty stamp award appears to happen via `loyalty_customer_id` on order, but `loyalty_stamps_awarded` is column-level — not idempotent if order is re-inserted.

## G. ID generation & concurrency

🔴 **G1.** **`order_number` race.** [`pos-supabase.js:308-319`](src/modules/pos/lib/pos-supabase.js:308): branch-code + date + `count(today)+1`. Two concurrent terminals get the same count → same `order_number`. The migration at line 72 has `text not null` with **no UNIQUE constraint**. Two orders, same number, both succeed. The receipt customers hold is no longer a unique key.

🔴 **G2.** **Stock decrement race.** [`pos-supabase.js:349-360`](src/modules/pos/lib/pos-supabase.js:349). Read `stock_qty=10` → write `9`. Two simultaneous sales both write `9`. Lost decrement. Should be `update pos_products set stock_qty = stock_qty - $1 …` (atomic) or a stored procedure.

🔴 **G3.** **Shift totals race.** [`pos-supabase.js:389-406`](src/modules/pos/lib/pos-supabase.js:389). Same pattern: read totals, add, write. Lost-update under concurrency. Cash variance grows over the shift.

🟠 **G4.** **`itemIdCounter` is per-tab module global** ([`POSTerminal.jsx:26`](src/modules/pos/pages/POSTerminal.jsx:26)). It resets on reload — fine for transient cart IDs but if a cart is re-opened after a queued offline order it could collide. (Currently no re-open feature, so latent.)

🟡 **G5.** **`offline_orders` keyPath** is `local_id` (auto-increment in IndexedDB). Different devices have independent counters — no cross-device collision risk because sync happens on each device, but if a user wipes IDB then re-installs PWA, history is lost.

🟢 **G6.** Branch code derivation (`getBranchCode`) returns first letters of words. "Noch Hay Alandlous" → "NHA"; "Noch Jaraba" → "NJ"; "Bloom Abu Nawas" → "BAN". Collisions possible with future branches ("Noch Hay Andalus 2" also = "NHA"). Latent.

## H. Other notable correctness items

🟠 **H1.** [`getPOSProductByBarcode`](src/modules/pos/lib/pos-supabase.js:198) filters only by legacy `branch_id` column, ignoring `visible_branch_ids` array model. Globalized products won't be found by barcode scan. Customer scans → "product not found" → cashier types manually → wrong price possible.

🟠 **H2.** `await supabase.from('pos_products').select('stock_qty').eq('id', product_id).single()` inside the order loop ([`pos-supabase.js:349-353`](src/modules/pos/lib/pos-supabase.js:349)) — N+1 query per cart line. Order with 5 items = 1 + 5 + 1 + 5 inventory writes + 1 + 1 = ~13 round-trips. On flaky LTE this is the slowest part of checkout.

🟡 **H3.** `cart` state survives terminal navigation (e.g. to Settings) only by accident — `POSTerminal` is route-scoped, navigation away unmounts and clears cart. No "hold tab" feature, but also no warning before navigation if cart has items.

🟡 **H4.** `confirm_pickup_order` RPC ([`POSTerminal.jsx:35`](src/modules/pos/pages/POSTerminal.jsx:35)) called for online orders is **not in the POS module** and not audited here — confirm separately that it deducts inventory, increments shift totals, and creates `pos_inventory_movements`. **NEEDS_MANUAL_VERIFY** in the supabase functions/migrations.

🟢 **H5.** `pos_orders.created_at` is server-side `now()` but `order_number` is computed against client clock (`new Date().toISOString().slice(0,10)`). A terminal with a wrong system date could produce an order_number for "yesterday" while DB stamps "today." Day-roll edge case, low likelihood.

## I. Top correctness risks (ordered)

1. **G1 + F1 — duplicate order numbers + non-idempotent retries** = customers can be double-charged with no easy reconciliation. Fix size **M** (atomic order_number via DB sequence; idempotency_key on `pos_orders`).
2. **C1 + C2 — partial-failure corruption** = phantom orders, missing items, ghost stock decrements. Fix size **M** (RPC that wraps the four writes in a single Postgres transaction).
3. **G2 + G3 — concurrent-write lost updates** = stock and shift totals silently wrong. Fix size **S** (`update … set x = x - $1`).
4. **E1 + E2 — EOD has no lock** = printed Z-report doesn't match cash drawer. Fix size **S** (status guard + `closed_at IS NULL` predicate; freeze further writes after close).
5. **A1–A4 — money math drift** = cents-level errors compound; receipts and ledger diverge on 3-dp prices. Fix size **M** (single money helper, decide 2-dp vs 3-dp policy, store + display + print all consistent).
6. **B1 — no modifiers** = the entire menu is misrepresented (a "Latte" is not a SKU, it's a configuration). Fix size **L** (new tables, UI, receipt rendering).
7. **D2 — Arabic on printer** = receipts have always been broken in Arabic, possibly unnoticed. Fix size **S** (set ESC/POS code page or print bitmap).
