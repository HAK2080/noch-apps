# Pass 1 — Repo map and baseline

**Auditor:** Opus 4.7 · **Date:** 2026-05-06 · **Scope:** `src/modules/pos/`

> Method: static read of every POS file plus the POS-related migration (`20260413100000_pos_system.sql`) and `20260417000000_pos_website_visibility.sql`, `20260501080000_global_products_per_branch_visibility.sql`, `20260502010000_product_sold_out_flag.sql`. No app/db was run; lint and typecheck status reported below.

## 1. File map

### `pages/`
| File | LoC | Purpose |
|---|---|---|
| `POSHome.jsx` | 187 | Branch picker + open-shift modal. Routes to `/pos/:branchId` after PIN gate. |
| `POSPinLogin.jsx` | 158 | 4–6 digit PIN entry; SHA-256+static-salt hash compared to `profiles.pin_code`. Has "Skip (Owner Mode)" bypass. |
| `POSTerminal.jsx` | 472 | Main register: products + cart + payment + receipt; polls online orders every 30 s. |
| `POSEndOfDay.jsx` | 240 | Z-report and shift close. Reads `expected_cash`, captures actual cash, calls `closeShift`. |
| `POSSettings.jsx` | 376 | Printer pairing (Web Serial), branch info edit, open-shift fallback, links to Products / Stock Check. |
| `POSProducts.jsx` | 841 | CRUD for `pos_products` and `pos_categories` (drag-sort, image upload, branch visibility, sold-out toggle). Largest file in module — purpose obvious from name but very wide. |
| `POSInventory.jsx` | 227 | Per-branch stock list + adjust + CSV export. |
| `POSStockCheck.jsx` | 820 | Weekly check-in tool (critical / important / low items, status entries, reminders). Heavy file — many concerns mixed. |

### `components/`
| File | LoC | Purpose |
|---|---|---|
| `ProductGrid.jsx` | 124 | Category tabs + grid; auto-selects "Matcha" category if present. |
| `CartPanel.jsx` | 232 | Line items, qty edit, discount UI (% or flat), charge button. |
| `PaymentModal.jsx` | 266 | Numpad, methods (cash/card/split/presto), loyalty QR scan. |
| `ReceiptModal.jsx` | 152 | On-screen receipt preview + Print + Open Drawer + New Order. |
| `BarcodeScanner.jsx` | 92 | Camera barcode (zxing). Used in terminal + product modal. |
| `QRScanner.jsx` | 71 | Loyalty QR (html5-qrcode). Lazy-imports library. |

### `lib/`
| File | LoC | Purpose |
|---|---|---|
| `pos-supabase.js` | 704 | All Supabase calls: branches, categories, products, shifts, orders, inventory, stock-check, daily/shift reports. **Order creation is non-atomic** (4 sequential writes). |
| `pos-offline.js` | 105 | IndexedDB wrapper (idb): products/categories cache, offline order queue, branch-config cache. DB version 1, no migration code. |
| `pos-sync.js` | 53 | `online` event handler that drains the offline queue via `createPOSOrder`. No idempotency, no per-order retry policy. |
| `escpos.js` | 205 | Web Serial ESC/POS driver for XPrinter NP-N200L. Module-level `_port`/`_writer` singletons; cash-drawer kick command. |

## 2. Core flows (entry → side effects → persistence)

| Flow | Entry | State | Side effects | Persisted |
|---|---|---|---|---|
| **Order** | `POSTerminal.handleCharge` → `PaymentModal.handleComplete` → `handlePaymentComplete` | `cart` (array), `showPayment`, `showReceipt` | `createPOSOrder` (4 writes), `cacheProducts` not refreshed after sale | `pos_orders`, `pos_order_items`, `pos_products.stock_qty`, `pos_inventory_movements`, `pos_shifts.total_*` |
| **Items / qty** | `addToCart`, `updateQty`, `removeItem` in terminal | local `cart` only | none | none until charge |
| **Modifiers** | **Not implemented.** No modifier table, no modifier UI. `notes` field exists on cart item but no UI to set it. | — | — | — |
| **Discount** | `CartPanel` discount toggle | `discountType`, `discountValue` | calls `onDiscount` (no-op) but `onCharge` payload carries discount; recomputed in `handlePaymentComplete` | `pos_orders.discount_amount`, `discount_pct` |
| **Payment** | `PaymentModal` | `method`, `cashTendered`, `cardAmount`, `loyaltyCustomer` | none (driver call after) | folded into `pos_orders` |
| **Print** | `ReceiptModal.handlePrint` → `escpos.printReceipt` | `printing` | `_writer.write` to serial port | none (no print log) |
| **Drawer** | `ReceiptModal.handleOpenDrawer` or settings test → `escpos.openCashDrawer` | none | serial bytes | none |
| **End-of-day** | `POSEndOfDay` | `actualCash`, `notes` | `closeShift` updates row | `pos_shifts.status='closed'`, `closing_cash`, `cash_difference` |

Files with non-obvious purpose: **none** — naming is consistent. `POSStockCheck` is wide for a "check" but the name does match content.

## 3. Test suite

`package.json` has **no `test` script.** The only tests are Playwright E2E under `tests/`:

```
tests/auth.setup.js
tests/auth-staff.setup.js
tests/owner-audit.spec.js
tests/staff-audit.spec.js
```

`playwright.config.js` requires `vite preview` (port 4173) and pre-built bundle. Audit run was **not executed** (no env vars, no live Supabase, would not be a meaningful pass/fail signal). **NEEDS_MANUAL_VERIFY** — run `npx playwright test` in a stocked dev environment.

There are **no unit tests** for money math, discount logic, ESC/POS rendering, or offline sync — the highest-risk code paths.

## 4. Lint and typecheck

* `npx eslint .` → **exit 0, zero output** (all files pass current ruleset).
* No TypeScript in this project (`.jsx` only). `tsconfig.json` is **absent**; project uses `@types/react` for editor IntelliSense only — there is no `tsc` step. **Typecheck not applicable.**

ESLint config is permissive: only `@eslint/js` recommended + react-hooks + react-refresh. **No** `no-floating-promises`, no `eqeqeq`, no `no-unused-vars` (Vite plugin only), no react-a11y. The clean lint result therefore says less about quality than the ruleset implies.

## 5. Dead code / unused exports (POS module)

Confirmed by reading:

* `POSTerminal.handleDiscount` (line 227) — accepts payload but does nothing; discount is read from `showPayment` (the charge data) instead. Dead handler.
* `pos-supabase.getShiftReport` (line 702) — thin alias of `getShiftSummary`; no callers found in module.
* `escpos.CMD` exported but only used internally.
* `pos-supabase.createInventoryMovement` exported; only consumed by `POSInventory.jsx`. OK.
* `pos-offline.cacheBranchConfig` / `getCachedBranchConfig` exported; **no callers** in `src/modules/pos/`. Likely dead.
* `escpos.disconnectPrinter` is exported but the in-memory `_port`/`_writer` are not re-hydrated on app reload, so a "connected" state shown after refresh is always stale until user re-clicks Connect. Not dead, but the `localStorage` flag `noch_printer_connected` is written but never read.
* In `pos-supabase.createPOSOrder`, the local `isCash` and `isCard` booleans (lines 378–379) are computed but never used.
* `POSPinLogin` exposes both `handleVerify` (button) and `handleDigit` (auto-submit at 6 digits). The two paths diverge — `handleVerify` selects `department`, `handleDigit` does not — minor duplication, not dead.

## 6. Notes for next pass

* `pos_orders.order_number` has **no UNIQUE constraint** in the migration; sequence is computed client-side as `count(today) + 1`. Concurrency risk — surfaced in Pass 2.
* RLS policy for every POS table is `using (true) with check (true)` to `authenticated` — **no row-level isolation**. Surfaced in Pass 4.
* PIN auth (`POSPinLogin`) is decorative: it doesn't replace `useAuth().user`; the supabase auth user remains the actor for `created_by` and shift open. Surfaced in Pass 4.
* Money is stored as `decimal(10,3)` server-side but JS sends floats. Pass 2 tracks divergence points.
