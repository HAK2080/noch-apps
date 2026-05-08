# Pass 5 — Missing features and gaps

Severity: **CRITICAL** (blocks scaling / blocks daily ops), **IMPORTANT** (hurts ops quality, fixable later), **NICE** (polish).

> Identification only — not proposals. Per-feature notes describe what is *not* in the current code and where similar scaffolding exists.

## Refunds and voids
- **CRITICAL** — **No refund flow at all.** `voidPOSOrder` ([`pos-supabase.js:436`](src/modules/pos/lib/pos-supabase.js:436)) flips `status='voided'` but does **not** reverse stock, shift totals, loyalty stamps, or print a refund slip. There is no UI to invoke `voidPOSOrder` (the "Void" button on `CartPanel` clears the live cart, not a persisted order).
- **CRITICAL** — **No partial refund.** Per-line refund of a multi-item ticket is not modelled.
- **IMPORTANT** — **No refund reason categories.** `void_reason` is a freeform text column.
- **IMPORTANT** — **No "find recent order" UI.** With no order-search, refunds are impossible even if the schema supported them.

## Open tabs / hold orders
- **IMPORTANT** — **No tab / hold-order feature.** Cart is single-active; navigating away clears it. Common in cafés where a customer pays at the end.
- **IMPORTANT** — Online-orders panel has `pending_confirm` status but no equivalent for in-store "fire to bar, settle later."

## Shift management
- **CRITICAL** — **No clock-in / clock-out for individual baristas.** Shift is per-branch, not per-staff. Multiple staff on same shift cannot be tracked; no per-barista totals.
- **CRITICAL** — **No mid-shift cash-in / cash-out (paid-in / paid-out).** Common operations: petty cash purchase, tip-out, owner pulling cash for safe drop. Schema has no movement table for this.
- **IMPORTANT** — **No drawer count at start of shift other than freeform input.** No denomination breakdown ("how many 50s, 20s, 10s"); over/short audit is single-number.
- **IMPORTANT** — **EOD has no manager re-open.** Once `closed`, no way to fix mistakes.
- **NICE** — **Multiple drawers per branch** (two terminals = two drawers) not modelled.

## Manager override flow
- **CRITICAL** — **No manager override pattern anywhere.** A barista with discount-cap-10% cannot escalate; the discount form just blocks. No PIN re-prompt for overrides, no audit trail of who approved.
- **IMPORTANT** — Same gap for void, large-discount, refund, drawer-pop without sale.

## Multi-branch inventory awareness
- **CRITICAL** — **No "is matcha out at this branch?" indicator inside the cart flow.** ProductGrid shows a low-stock badge but doesn't gray-out an out-of-stock SKU. `track_inventory=true` items at `stock_qty=0` can still be added to cart and sold (decrementing past zero, see Pass 2 G2).
- **IMPORTANT** — **No "transfer between branches"** UI. Schema's `pos_inventory_movements.movement_type` accepts text but there's no transfer codepath, no two-leg movement (out at A, in at B).
- **IMPORTANT** — **No "request stock from main warehouse"** flow. Each branch is its own inventory island.
- **NICE** — **No supplier purchase order tracking.**

## Reporting
- **CRITICAL** — **No reporting beyond a single shift's Z-report.** No weekly, monthly, by-day-of-week, by-hour, by-product, by-category, by-barista. `getDailySales` exists in the lib but **has no UI page consuming it.**
- **CRITICAL** — **No comparison reporting** (this week vs last, this month vs last). Can't tell if Tuesday afternoon is in trouble.
- **IMPORTANT** — **No customer report** (loyalty: best customers, recency, frequency, monetary).
- **IMPORTANT** — **No discount/void summary** in any report — the leakage report you'd want to see weekly does not exist.
- **IMPORTANT** — **No stock-on-hand valuation report.**
- **NICE** — Export to CSV/PDF: `POSInventory` exports stock CSV but Z-report doesn't.

## Loyalty integration (Nochi)
- **IMPORTANT** — POS captures `loyalty_customer_id` and `loyalty_stamps_awarded` on the order ([schema line 81-82](supabase/migrations/20260413100000_pos_system.sql:81)) but `loyalty_stamps_awarded` is **never set** anywhere in the audited POS module — defaults to 0. `lookupLoyaltyQR` finds the customer but does not award stamps. **Nochi is wired but not firing.** **NEEDS_MANUAL_VERIFY** of the RPC layer.
- **IMPORTANT** — No stamp-award rule engine: how many stamps per drink, which products qualify, redemption flow.
- **NICE** — No "earn-stamp receipt notice" line on the printed receipt.
- **NICE** — No loyalty dashboard inside POS (top stamp customers, stamps redeemed today).

## Customer-facing display (CFD)
- **IMPORTANT** — **No CFD route.** Architecturally the cart state lives in `POSTerminal` only — no broadcast channel, no `BroadcastChannel`/`postMessage` to a second screen, no separate `/cfd` route. Adding one would require lifting cart state.
- **NICE** — No "thanks, {{name}}" screen post-checkout.

## Tipping
- **IMPORTANT** — **No tipping flow.** `pos_orders` has no `tip_amount` column. Card flow goes straight to "process on Verifone" — tips entered on the Verifone are not captured back into the app.

## Receipts — Arabic / RTL / language
- **CRITICAL** — **Arabic glyphs likely print as garbage** (Pass 2 D2). XPrinter NP-N200L needs an explicit code-page set or bitmap rendering for Arabic. **NEEDS_MANUAL_VERIFY** on real hardware.
- **IMPORTANT** — **No language switch on receipt** (header/footer are bilingual mixed; line items only print English `product_name`).
- **IMPORTANT** — **RTL line layout** is not supported; Arabic line names get displayed LTR-padded to 48 columns.
- **NICE** — **No bilingual TOTAL / SUBTOTAL labels.**

## Numeric formatting / Libyan dinar
- **CRITICAL** — **2-dp display vs 3-dp storage** (Pass 2 A2). Libyan dinar uses 1/1000 millims. Either commit to 3-dp or store as 2-dp; current state is incoherent.
- **IMPORTANT** — **No thousands separator** on receipt or modal — 1245.50 LYD prints as `1245.50`, not `1,245.50` or `١٢٤٥.٥٠`.
- **NICE** — **No locale-aware decimal separator.** Libyan Arabic conventionally uses `,` for decimals — currently always `.`.

## Tax line
- **NICE** — **No tax field anywhere** (no VAT in Libya today). Future-proofing means schema adds + receipt template field.

## Audit log
- **CRITICAL** — **No audit log of POS-sensitive actions.** No table records: who voided, who applied a >10% discount, who closed a shift with cash difference, who edited a product price.
- **IMPORTANT** — `created_by` exists on `pos_shifts` but not on `pos_orders` — orders don't carry a barista FK. Combined with PIN gate being cosmetic (Pass 4 A2), there's no record of who served what.
- **IMPORTANT** — `pos_inventory_movements` exists but has no `created_by`.

## Other gaps surfaced during read

- **IMPORTANT** — **Customer name / phone on order.** `pos_orders` has nothing to identify a sit-in customer beyond `loyalty_customer_id`. "Pickup name" is only on online orders (`customer_name` field used in `OnlineOrderRow`).
- **IMPORTANT** — **Receipt search / reprint.** No history view inside the POS module to look up "the order from 15 minutes ago."
- **IMPORTANT** — **No table-management view in POS.** Online orders show `table_number` but in-store orders cannot be associated with a table.
- **IMPORTANT** — **No KDS (kitchen display).** `pos_orders` go to bar only via the printed receipt; if printer fails, the bar misses the order entirely.
- **IMPORTANT** — **No "sold out today" toggle exposed at the terminal.** `is_sold_out` flag exists in the data model ([`20260502010000_product_sold_out_flag.sql`](supabase/migrations/20260502010000_product_sold_out_flag.sql)) but no UI in `POSTerminal` to toggle a SKU sold-out for the day.
- **NICE** — **No barcode-printer support** for self-printed product labels.
- **NICE** — **No price-change history** (audit log on `pos_products`).
- **NICE** — **No drawer-pop log** ("opened drawer 14 times today, only 11 sales — investigate").
- **NICE** — **No item modifier presets** (e.g. "Latte: oat milk, no sugar" saved as a quick-button).

## Summary by severity

**CRITICAL (blocks scaling or daily ops):**
1. No refund flow.
2. No partial refund / no order lookup UI.
3. Per-barista shift / clock-in.
4. Cash-in/out (paid-in/out) movements.
5. Manager override pattern.
6. Out-of-stock cannot block a sale.
7. No reporting beyond single Z-report.
8. Arabic receipts likely broken.
9. 2-dp/3-dp money inconsistency.
10. No audit log for POS-sensitive actions.

**IMPORTANT:**
- No tabs / hold orders, no tip flow, no KDS, no sold-out toggle, no order search/reprint, no inventory transfers, no loyalty stamp awarding (currently dormant), no manager re-open EOD, no per-customer identifier.

**NICE:**
- CFD, RTL receipts, locale-aware numbers, drawer-pop log, price-change history, supplier POs.
