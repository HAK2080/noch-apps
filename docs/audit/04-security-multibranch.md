# Pass 4 — Security and multi-branch

Severity: **🔴 critical**, **🟠 high**, **🟡 medium**, **🟢 minor**.

## A. Auth

🔴 **A1.** **Wide-open RLS on every POS table.** [`supabase/migrations/20260413100000_pos_system.sql:117-132`](supabase/migrations/20260413100000_pos_system.sql:117) creates the policy `pos_all` as `using (true) with check (true)` for `to authenticated` on every POS table — branches, categories, products, shifts, orders, order items, inventory movements. Any authenticated user — barista, content-team member, anyone with the published anon key + a sign-up — can:

* Read every order at every branch.
* Update any product's price.
* Void any order at any branch.
* Insert fabricated orders attributed to any shift.
* Modify shift `total_cash_sales` to hide cash skim (the only check is the EOD diff, and they can rewrite both sides).

This is the single largest risk in the audit. **All authorization is currently client-side.** A user with browser devtools can bypass it in 30 seconds.

🔴 **A2.** **PIN gate is decorative.** [`POSPinLogin.jsx:73-76`](src/modules/pos/pages/POSPinLogin.jsx:73) successfully verifies a PIN and calls `onSuccess(profile)`, but the parent ([`POSHome.jsx:117`](src/modules/pos/pages/POSHome.jsx:117)) just navigates. The verified profile is **discarded** — `POSTerminal` and `openShift` continue to use `useAuth().user`, which is the supabase auth user (often the owner). PINs do not track who actually rang the order in `pos_shifts.created_by` or anywhere else.

🔴 **A3.** "Skip (Owner Mode)" bypass. [`POSPinLogin.jsx:150-154`](src/modules/pos/pages/POSPinLogin.jsx:150) renders a button that calls `onSkip()` with no role check — anyone can press it.

🟠 **A4.** **Static client-side PIN salt.** [`POSPinLogin.jsx:14`](src/modules/pos/pages/POSPinLogin.jsx:14) `pin + 'noch_salt_2026'`. The salt is in the bundle, the algorithm is SHA-256, and PINs are 4–6 digits. A precomputed rainbow table for all 6-digit PINs is ~1 M entries. Anyone with read access to `profiles.pin_code` (which any authenticated user has) can recover every PIN.

🟠 **A5.** **No rate limiting on PIN attempts.** [`POSPinLogin.handleVerify`](src/modules/pos/pages/POSPinLogin.jsx:32) makes a Supabase `select` per attempt. Brute force online is feasible.

🟠 **A6.** **PIN is global, not branch-scoped.** [`POSPinLogin.jsx:42-47`](src/modules/pos/pages/POSPinLogin.jsx:42) selects the first matching profile across all branches. Two staff with the same PIN collide silently — first match wins. The query also has no `branch_id` filter even though `branchId` is a prop, so a barista from Branch A can PIN into Branch B's terminal.

🟡 **A7.** **No idle/session timeout on the terminal.** Once unlocked, no re-prompt for void, refund, or end-of-day.

🟡 **A8.** Sign-up is open: `signUp` ([`AuthContext.jsx:60`](src/contexts/AuthContext.jsx:60)) creates a profile with `role: 'staff'`. Combined with A1, anyone who can register an account becomes an authenticated user with full POS access.

🟡 **A9.** Role check `isOwner = profile?.role === 'owner'` is the **only** gate for `OwnerRoute` ([`App.jsx:91-95`](src/App.jsx:91)). `RoleManager` is owner-gated client-side; if A1 weren't blocking, owner role escalation would still be possible at the DB layer because `profiles` RLS is in a separate file (not audited here, **NEEDS_MANUAL_VERIFY**).

## B. Authorization on the client (`usePermission` map)

[`src/lib/usePermission.js:9-17`](src/lib/usePermission.js:9):

| Permission key | Checked client-side at | Server enforcement? |
|---|---|---|
| `pos.discount_any` | [`CartPanel.jsx:86`](src/modules/pos/components/CartPanel.jsx:86) | **No.** Discount cap is UI-only. |
| `pos.void_order` | [`CartPanel.jsx:87`](src/modules/pos/components/CartPanel.jsx:87) for cart clear; **no check on actual `voidPOSOrder` callers** outside of the `Trash2` icon visibility | **No.** Anyone authenticated can call `voidPOSOrder`. |
| `pos.end_of_day` | [`POSEndOfDay.jsx:16`](src/modules/pos/pages/POSEndOfDay.jsx:16) | **No.** RLS allows close. |
| `staff.edit` | not used in POS | n/a |
| `analytics.financial` | not used in POS | n/a |

🔴 **B1.** Every entry above is **only** enforced in the React tree. Hide the button with React DevTools, the network call still succeeds.

🟠 **B2.** **Sensitive actions with no client check at all:**
- `updatePOSProduct` (price changes) — no `usePermission`.
- `updatePOSBranch` (receipt header changes) — no check.
- `openShift` / `closeShift` — no check (any authenticated user can open or close a shift).
- `createPOSOrder` — no check.
- `updateProductStock` — no check.
- `bulkSaveStockEntries` — no check.

## C. Branch scoping

🟠 **C1.** Branch ID lives in the URL (`/pos/:branchId`). There's no verification that the logged-in user is associated with that branch. A user can deep-link `/pos/<other-branch-uuid>` and ring up sales there.

🟠 **C2.** Profiles do not have a `branch_id` (or `assigned_branches[]`) column referenced anywhere in the audited POS module. There is **no concept** of "this barista works at Hay Alandlous." Multi-branch scaling needs this.

🟠 **C3.** Shifts are branch-scoped at the row level, but RLS doesn't enforce it. A shift opened by user X at Branch A can be closed by user Y from Branch B.

🟢 **C4.** `getOpenShift(branchId)` is correctly scoped in the query — the issue is the lack of RLS, not the code.

## D. Sensitive data in the client

🟢 **D1.** No hard-coded API keys spotted in the POS module. Supabase URL and anon key come from `import.meta.env.VITE_*` ([`src/lib/supabase.js:3-4`](src/lib/supabase.js:3)) — standard pattern, not a leak (anon key is meant to be public if RLS is correct).

🟠 **D2.** `localStorage` accumulates: supabase auth token (default), `noch_printer_connected`. Anyone with momentary device access can lift the auth token. With A1, that token grants full ledger access from any device.

🟠 **D3.** **Profile lookup table includes `pin_code` hash** ([`POSPinLogin.jsx:42`](src/modules/pos/pages/POSPinLogin.jsx:42)). Even if RLS on `profiles` restricted SELECT to self, the PIN-verify query implies broad SELECT (it queries `pin_code = $hash` across all profiles). **NEEDS_MANUAL_VERIFY** the `profiles` RLS policy — if SELECT is open, anyone can dump `pin_code` and (per A4) crack PINs offline.

🟢 **D4.** No PII on receipts beyond the operator's chosen header — fine.

🟢 **D5.** Loyalty customer name is fetched at PIN scan via `lookupLoyaltyQR` (RPC). The token in the QR is a one-shot lookup — **NEEDS_MANUAL_VERIFY** of the RPC behaviour (audit not included).

## E. Recipe / cost data exposure

🟢 **E1.** `pos_products` schema does **not** include `cost_price`, `cost_pct`, `recipe_id`, or any cost field. The POS terminal and POSProducts CRUD never request cost data. Recipes are a separate module gated by `OwnerRoute` and not loaded by the POS module.

🟢 **E2.** Storefront menu visibility (`visible_on_menu`, `featured`, `menu_description`) is exposed but those are public-by-design.

🟡 **E3.** `getProductSalesStats` ([`pos-supabase.js:128`](src/modules/pos/lib/pos-supabase.js:128)) returns qty + revenue per product. Combined with A1 a barista can pull a 30-day revenue-per-SKU table for any branch — that's competitive intel, even if not "recipe leak" tier.

🟡 **E4.** Top-products on Z-report exposes `qty` and `revenue` per item — appropriate at end-of-shift, but only the on-shift staff should see other branches' equivalents (currently they can).

## F. Multi-branch readiness specifics

| Concern | Status |
|---|---|
| User → branch assignment | **Missing.** No table, no UI. |
| RLS by branch | **Missing.** Policy is `using (true)`. |
| Cross-branch reporting | Possible only because RLS is open — i.e. it works for the wrong reason. |
| Inventory transfers between branches | **No code path.** `pos_inventory_movements.movement_type` is text but there's no UI for transfers. |
| Centralised product catalog vs per-branch overrides | Half-done: `visible_branch_ids` array exists ([`pos_website_visibility.sql`](supabase/migrations/20260417000000_pos_website_visibility.sql)) but barcode-scan still uses legacy `branch_id`. |
| Per-branch pricing | Not modelled. `pos_products.price` is a single column. Two branches with different prices need duplicate products. |
| Per-branch tax / receipt language | `currency` and `receipt_header`/`receipt_footer` exist; Arabic glyphs broken at print (Pass 2 D2). |
| Per-branch shift lock | None. Two terminals at the same branch share one shift; concurrency-broken (Pass 2 G3). |

## G. Top security risks

1. **A1 — RLS open everywhere.** Single biggest risk. Fix size **M**: write per-table policies that scope by `branch_id` joined to `staff_branches(user_id)`, plus add a `created_by` check for shift writes.
2. **A2 + A3 — PIN gate cosmetic + skip bypass.** Fix size **S**: thread the PIN-verified profile through context, drop "Skip", record `served_by` on every order.
3. **A4 + A5 — PIN crackable + no rate limit.** Fix size **S**: per-user salt, rate-limit RPC, longer PINs or hardware-backed.
4. **B2 — sensitive POS writes have no permission check anywhere.** Fix size **M**: add server-side authorization in stored procs / edge functions; lock down direct table writes.
5. **C1 + C2 — branches not user-scoped.** Fix size **M**: introduce `staff_branches(user_id, branch_id, role)`; enforce in RLS and route guard.
6. **D3 — PIN hashes potentially world-readable** depending on `profiles` RLS (verify).
