# Noch Apps — Full Application Audit

**Date:** 2026-07-18 · **Workspace:** `Jul 26 release` @ commit `045c7c8` · **Method:** read-only static audit; 8 parallel domain deep-dives (POS, finance, accounting/GL, inventory/recipes, loyalty/marketing, content studio/ops, storefront/shell, Supabase data layer), every claim verified against source with file:line evidence; headline defects additionally re-verified first-hand. Supersedes `docs/audit/00-summary.md` (May 2026) and extends `docs/APP-ASSESSMENT-2026-07-17.md`. Live Supabase/RLS behavior not executed.

---

## 1. System Map

- **apps/pos** — authenticated staff/owner SPA **and** host of the public customer surfaces (menu, feedback, online ordering) on apps.noch.cloud. ~70 routes in `src/App.jsx`. Modules:
  - `modules/pos` (11.5k lines) — counter POS: terminal, shifts, EOD, orders/voids/refunds, offline sync, thermal printing. All writes go through SECURITY DEFINER RPCs (`create_pos_order`, `close_pos_shift`, `void_pos_order`, `refund_pos_order_lines`, …) — transactional, idempotent, audited.
  - `modules/finance` (3.2k) — cash-basis management P&L (`finance_pnl` RPC), exec summary, cash/runway, menu profitability, expenses, bank CSV import, variance, CapEx, forecast.
  - `modules/accounting` (0.7k) — double-entry GL (added 2026-06-13): chart, journals, trial balance, statements; posting RPCs + hourly `gl-nightly-sync` cron.
  - `modules/costCalculator` (3k) — **entirely dead code** (zero importers); its tables (`ingredients`, `stock`, `cost_recipes`…) are the live inventory backbone accessed from `pages/inventory/*`.
  - `modules/loyalty` (4.1k) — stamps/points/tiers/streaks/mascot CRM; `modules/marketing` (2k) — RFM segments, cohorts, WhatsApp campaigns.
  - `modules/contentStudio` (8.3k) — AI content pipeline (inspiration → concept → brief → draft → evaluate → content bank) + dialect trainer; legacy content engine still routed at `/content*`.
  - `modules/ops` (1.3k) — checklist module, ships disabled.
- **apps/storefront** — the live site is a 2,762-line legacy `index.html` (dev-React + in-browser Babel, hardcoded anon key). The Vite SPA in `src/` (~1,490 lines) is **dead since a same-day revert** (`767074d`). `public/passport/index.html` (Nochi Pass) is live.
- **supabase** — 126 migrations, 33 edge functions, 120 tables, 6 pg_cron jobs. **Baseline not reproducible:** the remote-schema baseline migration is empty; core tables live in root paste-in SQL files; **15 app-referenced tables have no CREATE anywhere** in the repo.
- **packages/shared** — README-only stub, abandoned.

## 2. Critical Defects (P0) — all re-verified first-hand

| # | Defect | Evidence | Impact |
|---|--------|----------|--------|
| 1 | **POS loyalty stamps silently never credited.** `create_pos_order` updates `loyalty_customers.stamps` — column doesn't exist (schema has `current_stamps`/`total_stamps`); `exception when undefined_column then null` swallows it on every order. Receipt prints "⭐ N stamps awarded". | `supabase/migrations/20260516020000_create_pos_order_customer_phone.sql:220-229`; schema `20260412180000_loyalty_system.sql:34-35`; receipt `escpos.js:346-348` | Core loyalty earn loop off since 2026-05-07; customers promised stamps they never get. |
| 2 | **Refunds invisible to finance & GL.** `pos_orders.refunded_amount_lyd` written once by a backfill (2026-05-08) and never again — the refund RPC updates `refunded_qty` only. | Only writer in repo: `20260508040000_finance_marketing_phases.sql:16-21`; refund RPC `20260507030000:435-501` | Net-of-refunds P&L, refund KPIs, and GL refund lines all wrong for 2.5 months. POS and Finance disagree on the same day. |
| 3 | **GL reports ignore date/branch/status filters.** In `gl_trial_balance`, `gl_balance_sheet`, `gl_income_statement`, batch predicates sit in the second LEFT JOIN's ON clause — every journal line ever is summed. | `20260613040000_gl_reports_rpcs.sql:19-23` (and :61-70, :84-92) | Trial balance / balance sheet / income statement are all-time, all-branch, all-status. "As of" and branch selectors are no-ops. Balances still equal, so the bug is invisible in the UI. |
| 4 | **`create_pos_order` granted to `anon`.** SECURITY DEFINER, no auth/branch check inside. | `20260516020000:266-269` | Anyone with the public anon key can mint completed orders, decrement stock, inflate shift totals. Introduced 2026-05-16, looks accidental. |
| 5 | **Guest orders: orphan rows + no qty validation + coupon theater.** Order row inserted before item validation; `RETURN` (not rollback) on unknown product leaves a pending ghost order. No `quantity > 0` check — negative-quantity orders accepted from an anon RPC. Client shows coupon-discounted total; server has no coupon parameter — charged/recorded full price. | `20260513050000_online_order_approval.sql:65-95` (no coupon anywhere in file); `Menu.jsx:530` | Ghost orders in staff queue; negative totals possible; customer shown one price, records another. |
| 6 | **WhatsApp campaigns CHECK-blocked end-to-end.** `marketing_campaigns` segment CHECK excludes Phase-6 segments (`birthday_this_week`, …); status CHECK excludes `approved`/`sending`/`failed`. | `20260508040000:95,102` | Quick-launch tiles can't even save a draft; dispatch breaks at first status update. Feature 100% dead as shipped. |
| 7 | **Income statement adds discounts & refunds to revenue.** Contra-revenue accounts 4090/4095 are debit-normal → returned positive; UI computes `netProfit = Σrevenue − Σcogs − Σexpenses`. | `AccountingDashboard.jsx:433-434` + `20260613010000:168-169` + `20260613040000:82-85` | Profit overstated by 2×(discounts+refunds). |
| 8 | **GL books Presto sales as cash.** `v_cash = v_total − v_card` sweeps presto into Cash on hand; seeded `presto_clearing` account never used. | `20260613030000:60`; map seed `20260613010000:208` | GL cash overstated by uncollected aggregator receivables daily. |

## 3. Money & Calculation Register (verified, grouped)

**POS / orders**
- Cart totals computed twice differently: `CartPanel.jsx:111` raw float vs `POSTerminal.jsx:646-648` money.js rounding — displayed total can differ ~0.01 from stored; `change_due` computed against the unrounded total (`PaymentModal.jsx:57-59`).
- Discount cap UX lies: typed 50% silently applies 10% while storing the *typed* value as `discount_pct` on the order (`CartPanel.jsx:116-121`, `POSTerminal.jsx:679`) — audit log can read "50%" for a 10% discount.
- Refund math ignores order-level discounts and modifier price deltas (`20260507030000:467-468`) — refunding a discounted order returns more than was paid; shift totals drift.
- `void_pos_order` restocks **all** lines with no `track_inventory` filter (`20260506010000:466-484`) while create decrements only tracked items and refund restocks only tracked items → voiding a drink order inflates stock; partial-refund-then-void double-restocks.
- Split-sale KPIs invisible in POSReports (`POSReports.jsx:277-289`) — buckets under-report vs Gross; `/sales` page drops presto from grand total (`Sales.jsx:77-91`).
- Offline order numbers unique only per device (`pos-offline.js:77-83`); two tablets mint `OFFLINE-1` → second device hits `UNIQUE(branch_id, order_number)` and the order is stuck in the sync queue forever.
- POSOrders apportions split refunds pro-rata; POSSessions deducts 100% from cash — the two screens disagree (`POSOrders.jsx:384-406` vs `POSSessions.jsx:130-142`).
- Stale terminal can still insert orders into a closed shift — totals update silently skipped (`20260516020000:210`), order row persists → unflagged drift.
- `openShift` is a bare insert (`pos-supabase.js:303-317`) — two tablets can open parallel shifts; no unique partial index.
- Server never validates `p_total = p_subtotal − p_discount` or Σ lines (`20260516020000:160`) — client money math fully trusted.

**Finance**
- Day-window drift, three definitions live: `pos_sales_daily` = 5AM→5AM Tripoli (`20260717120000:14`); `finance_pnl` = UTC-midnight = 02:00→02:00 Tripoli (`20260523010000:33-34`); GL copies finance (`20260613030000:24-25`); order numbers use UTC calendar day. A 00:30 sale lands in three different "days".
- Branch P&L attribution broken: `expenses` leg has **no branch filter at all**; `expense_entries` leg includes null-branch rows in every branch (`20260523010000:78,89-92`) → Σ(branch nets) ≠ total net.
- Three expense ledgers: `expenses` (canonical), `expense_entries` (zombie — no UI writer left, still read by P&L/variance/runway/GL), `operating_costs` (legacy analytics + Odoo sync). UNION without dedupe → double-count possible.
- COGS uses **current** `pos_products.cost_lyd` × full `oi.quantity` (not net of `refunded_qty`) — editing a cost rewrites history; refunded lines keep their COGS while revenue drops (`20260523010000:36-56`).
- `finance_cash_runway`: burn = avg weekly `expense_entries` only (excludes `expenses`, payroll, COGS; skips empty weeks instead of zeroing) — "runway" is systematically over-optimistic (`20260508010000:304-343`).
- `finance_variance` reads only `expense_entries` → compares budgets against ~0 (`20260508040000:292-299`).
- `finance_forecast`: headcount term `× 1500` added **once per horizon**, not per month (3× understated at 90d, :346); "Matcha Δ%" slider scales **all** COGS (:344).
- `finance_menu_matrix`: revenue = Σ line totals but unit price = `max(unit_price)` → contribution overstated after any price change (`20260508030000:98-128`).
- Likely-broken upserts: bank CSV dedupe and budget upsert use column-list `onConflict` against **expression** unique indexes → 42P10 as defined in repo (`finance-supabase.js:377,165` vs `20260508010000:138-139`, `20260508040000:35-36`). Verify live.
- Open shifts accrue labor unboundedly (`shift_labor_cost` computes `now() − clocked_in_at`, `20260612030000:85-88`) — a forgotten clock-out inflates every subsequent P&L.
- Legacy `/analytics-legacy` FinancialTab: queries nonexistent `pos_order_items.cost` → COGS always falls back to 35% estimate; salary added on top of Odoo payslip opex → double-counted (`FinancialTab.jsx:112-158`).
- CapEx: `expected_life_months` collected, never used — **no depreciation exists anywhere**; `payback` divides by owner's own guess (`CapexTab.jsx:63`).

**Accounting / GL** (beyond P0 #3/#7/#8)
- Rounding abort: 3-dp POS money vs 2-dp GL variables — `.xx5` collisions can throw the balance trigger and kill the whole period sync (no per-day exception handler, `20260613030000:277-283`).
- Balance trigger is `BEFORE UPDATE` only — direct `INSERT status='posted'` bypasses it (`20260613010000:127`).
- Balance sheet never balances by construction — no earnings plug; seeded `current_year_earnings_account_id` never read.
- Inventory account 1200 only ever credited (COGS) — drifts negative forever; ingredient purchases double-counted (expensed + relieved through COGS).
- All GL RPCs are SECURITY DEFINER granted to `authenticated` with no in-function role check — any staff JWT can repost periods or fabricate opening balances.
- "Nightly" sync runs hourly (`'15 * * * *'`, `20260613050000:14`).

**Inventory / recipes / costing**
- Procurement receive is broken 3 ways: name string into `ordered_by uuid` (every insert fails), no unit conversion on receive, FX corruption when updating bulk cost (`ProcurementOrders.jsx:121,136-159`).
- Ingredient deduction trigger (`scripts/migrate.js:163-195`, if deployed): no unit conversion (18 g deducted from a kg-counted row), no restore on void/refund/cancel — one-way leak.
- `get_ingredient_consumption` fallback cross-joins by name substring → croissant counts as coffee consumption; `avg_daily_g` off-by-one (`20260518020001:46-54`).
- `updateStockQty` / `POSInventory.handleAdjust` / `updateProductStock`: read-modify-write, non-transactional (lost updates, desynced logs).
- `calcCostPerBaseUnit`: no zero-guard (÷0 → Infinity); missing FX row silently prices USD at 1:1 LYD (`lib/supabase.js:62-84`).
- InventoryHub days-to-out reads `ingredient_consumption` — a table nothing creates → headline feature silently dead (`InventoryHub.jsx:252`); same metric duplicated with divergent fallback in `InventoryIntelligence.jsx:9-13`.
- Stock can go negative by default (`block_out_of_stock` defaults off).

**Loyalty / marketing**
- `award_loyalty_stamp` race: no `FOR UPDATE` — concurrent stamps lose increments; at goal−1 both insert a reward → double free drink. No idempotency on retries (`20260604040000:19-96`).
- Streak increments per stamp, not per day — "7-day streak" gameable in one afternoon; `total_visits` written by two overlapping writers with different semantics.
- Referral clobber: trigger grants referee +1, then the RPC's absolute assignment overwrites it — referee never gets the bonus (`20260501030000:123-172`).
- `submit_feedback`: voucher insert uses nonexistent `code` column → whole function rolls back when a customer crosses the goal (`20260604030000:133-139`). Same phantom-column class in `loyalty_nochi_day_run` (`metadata`) and spin wheel (`reward_value`).
- Two conflicting points economies share one `points` column (April: 100/visit, 900/reward; June: 10/feedback, 50/goal).
- `LoyaltyStamp.jsx` (the "Stamp Counter" page) references 4 nonexistent columns — cannot complete a single stamp, shows the win animation without writing a reward.
- `stamp_goal` hardcoded to 9 in ≥8 places while Settings allows 3–20 (`CustomerDetail.jsx:83,190`, `owner_insights_near_reward` SQL, both passport pages…).
- Rewards never expire: nothing sets `status='expired'`; redeem path doesn't check `expires_at` (`loyalty-supabase.js:195-203`).
- Lifecycle WhatsApp RPCs claim consent filtering in comments but have **no WHERE clause** — messages go to every customer with a phone (`20260501020000`); birthday cron advertises a reward that is scheduled nowhere.
- Campaign dispatch: browser-side loop, no dedupe (payload_key never read, no unique index), tab-close leaves campaign stuck in `sending`; partial failure reported as `sent`.
- WhatsApp KPIs structurally always 0: code counts `delivered`/`read` but CHECK allows only `sent`/`failed` and no status callback exists.
- Loyalty liability (pending rewards × drink cost) appears nowhere in finance/GL.

**Content studio / ops**
- `BriefDetail.generate` writes wrong column names/status → drafts fail or persist empty, brief marked `used` anyway (`BriefDetail.jsx:86-100`); `CampaignDetail` selects nonexistent `body` column → drafts panel always empty.
- `getAveragePerformance(brandId)` ignores `brandId` — averages across ALL brands (`content-supabase.js:596-604`).
- `process-reminders` timezone bug: client schedules with device-local `setHours`, edge function recomputes with UTC `setHours` → every recurrence after the first fires ~2h late in Tripoli; unescaped Telegram Markdown = poison messages retried forever.
- Signals queries unbounded → PostgREST 1000-row cap silently skews 30/60-day windows; daypart buckets use device-local hours on UTC timestamps.
- Learning signals/user edits recorded but **never read by any prompt** — "learning" is write-only telemetry.

**Storefront / shell**
- Live shop checkout calls `place_shop_order` — an RPC defined in **no migration ever** (checkout fails unless hand-created in prod).
- Money display policy chaos: policy says 2dp (`money.js`), but 24× `toFixed(3)` remain; customer surfaces show 2dp (POS menu), 3dp (dead SPA), **0dp** (live standalone shop — 12.5 LYD displays as "13 LYD", `index.html:1238,1340`).
- Staff loyalty QR encodes `#loyalty?t=<token>`; the standalone only opens on exact hash equality and never parses `t` — the QR does nothing.
- Geofence: client blocks at `radius || 20` m, server allows when radius IS NULL — pick one.
- Online orders never decrement stock and never attach to a shift (`20260513050000:123-169`) — inventory drifts per online sale.
- Anon data exposure: public menu does `select('*')` on `pos_products`; shop selects `stock_qty`/`track_inventory` — costs and stock levels served to the public anon key.

## 4. Security / RLS Posture

- **POS tables still `using (true)`** — `pos_orders`, `pos_order_items`, `pos_shifts`, `pos_inventory_movements`, `pos_settings`, modifiers, `pos_cash_movements`, `pos_audit_log` (`20260413100000:126-132` + later migrations). Loyalty/finance/GL got scoped policies; POS never did.
- **`staff_branches` + `user_has_branch_access` exist but are never called** by any policy, RPC, or app code — the promised branch-scoping follow-up never happened (`20260506010000:72-106`).
- `expenses` UPDATE policy `using (true)` — any authenticated staff can approve expenses; gate is client-side only (`EXPENSES_SETUP.sql:121`).
- `verify_jwt = true` ≠ authorization: `send-whatsapp` (spends Twilio balance), `send-telegram`, `loyalty-stamp` (self-award free drinks) have no in-body role check; the anon key is a valid JWT and ships in the public bundle.
- Unauthenticated by config: `whatsapp-cron` (open batch trigger), `cs-extract-concept`, `cs-evaluate-draft`, `analyze-brand`, `auto-research`, `generate-content` (open Anthropic spend), `telegram-webhook` (no secret-token verification — forged updates become task comments), `extract-inventory` (no auth at all).
- `AuthContext.signUp` backfills `role:'staff'` client-side — latent self-service staff-account path if email signup is enabled.
- Storefront loyalty RPCs (if prod has them — not in migrations) are gated by **phone number alone**: card read + reward redemption with no OTP/session.
- `StockManager.jsx:113-124` calls the Anthropic API **directly from the browser** with `VITE_ANTHROPIC_API_KEY` — key ships to every client.
- GL balance trigger `BEFORE UPDATE` only; posted journals mutable by owner/accountant; `'void'` status unreachable.
- PIN hardening, `pos_audit_log`, order idempotency, shift guards — **all landed and solid** (see §6).

## 5. Redundancy & Dead Code Inventory (quantified)

**Dead code (~7,000+ lines removable):**
- `apps/pos/src/modules/costCalculator/**` — 3,018 lines, zero importers; internal near-duplicates (`Layout.jsx` vs `CostLayout.jsx`).
- `apps/storefront/src/**` — ~1,490 lines, unreferenced since revert `767074d`; plus byte-identical `index.standalone.backup.html` (2,762 lines) and `src/data/bloomly-products.json` (1,593 lines, another business's catalog).
- `pages/storefront/Checkout.jsx` + `OrderConfirmation.jsx` (+385 CSS lines) — routed but unreachable.
- 4 orphan content pages (`ContentCalendar`, `ContentCreator`, `ResearchHub`, `Experiments`) — ~1,070 lines.
- Dead exports: `pos-supabase.js` (`getDailySales`, `getShiftReport`, `getSalesByProduct`, `getPOSProduct`), `finance-supabase.js` (expense CRUD, `ocrInvoice`, product-linking helpers), `lib/supabase.js` (~150 lines: V3 analytics block, cost-recipe CRUD), `loyalty-supabase.js` (6 exports), `accounting-supabase.js` (`postSalesDay`).
- `deploy-build/` committed build output.

**Duplicated systems (pick one, delete the other):**
- **3 expense ledgers** (`expenses` / `expense_entries` / `operating_costs`).
- **3 recipe representations** (`recipes` JSONB / `cost_recipes`+`recipe_ingredients` / hardcoded `RECIPES` in CostCalculator.jsx) + 4 conflicting recipe seeders.
- **2 content pipelines** (contentStudio vs legacy `/content*`), with **contradictory dialect doctrine** — one teaches "هسّا", the other forbids it.
- **2 challenge systems** (`loyalty_challenges` vs `nochi_challenges`), **2 QR token systems** (both unconsumed), **2 feedback paths**, **2 passport frontends**, **3 stamp-award paths** (2 broken), **2 product editors** (POSProducts vs ProductCatalog), **3 FX sources** (`currency_rates` / `cc_exchange_rates` / hardcoded 4.88), **3 stock concepts**.
- Money formatters: 1 canonical (`money.js`) vs 5 local copies + 186 inline `toFixed(2)`.
- Edge functions: CORS block re-declared in 32/33; hand-rolled REST helpers duplicated in 5; Telegram calls in 6; **4 different `extractJson` implementations**; **5 different Claude model IDs**; no `_shared/` dir. **14 of 33 functions have no caller in the repo.**
- Duplicated migrations: `20260417_big_build.sql` vs `20260417_001_schema_additions.sql`.
- `posT` helper copied verbatim into 4 POS components; `daysToOut` in 2 pages with divergent fallbacks.

**Dead/phantom tables:** `loyalty_referrals`, `role_requests`, `marketing_campaign_recipients`, `loyalty_challenges(+progress)` (v1), `pos_coupons` (referenced by RPC + UI, created nowhere). **Write-only:** `pos_audit_log` (no reader UI!), `loyalty_customer_badges`, `loyalty_nochi_day_runs`, `*_archive` snapshots. **Missing schema:** 15 tables referenced by app code have no CREATE in repo (incl. `ingredients`, `stock`, `cost_recipes`, `cs_draft_variants`).

## 6. Prior-Audit Verification Summary

**Fixed since May 2026 (the heavy engineering landed):** atomic+idempotent order creation (single RPC, branch lock, idempotency keys, UNIQUE order numbers) · atomic stock/shift updates · EOD close status guard + reconciliation diff · offline sync idempotency + preserved offline numbers · PIN per-user salt + server-side lockout · `pos_audit_log` on all order/shift actions · `served_by` attribution · refunds/manager-override/per-barista/sold-out/reporting features exist · exec-summary data-freshness labeling · RFM segmentation + loyalty dashboard.

**Still present / regressed:** POS table RLS wide open (worse: `create_pos_order` now anon) · two (actually three) expense systems · business-day inconsistency (worse: July-17 migration moved POS views to 5AM without touching finance/GL) · branch profitability attribution · no `closing` shift state · cross-device offline number collision · legacy analytics/content routes reachable · 2dp-vs-3dp policy decided but never rolled out · no money/GL/RLS tests.

**New findings neither audit caught:** GL report join bug · contra-revenue sign error · Presto-as-cash · stamps column no-op · `refunded_amount_lyd` freeze · rounding-abort in GL sync · campaigns CHECK-blocked · lifecycle consent gap · dead costCalculator module · dead storefront SPA · guest-order orphans · coupon theater.

## 7. Prioritized Fix Plan

**P0 — this week, all S-sized (<1 day each):**
1. Revoke `anon` from `create_pos_order`; audit every `GRANT … TO anon`.
2. Fix stamps: `stamps` → `current_stamps`/`total_stamps` in `create_pos_order`; backfill from `pos_orders.loyalty_stamps_awarded`.
3. Maintain `refunded_amount_lyd` in `refund_pos_order_lines` (+ re-backfill).
4. Fix the 3 GL report JOINs (copy `gl_account_ledger`'s WHERE pattern).
5. Fix income-statement contra-revenue signs.
6. `submit_guest_order`: raise instead of RETURN (rollback orphans), `quantity > 0` check, restore branch filter, server-side coupons (or remove coupon UI).
7. Widen `marketing_campaigns` CHECK constraints (segment + status).
8. Void restock: add `track_inventory` filter + subtract already-refunded qty.
9. Post Presto to `presto_clearing`; settle on `mark_presto_collected`.
10. In-body role checks on `send-whatsapp`, `send-telegram`, `loyalty-stamp`; `verify_jwt=true` for the 5 open AI functions + `whatsapp-cron`.

**P1 — next two weeks:** one expense source of truth (`finance_opex` view, migrate `expense_entries`) · unify business day across POS/finance/GL · branch attribution for expenses · GL rounding-abort fix + per-day exception handling · balance-sheet earnings plug · discount-aware refunds · ship or remove `place_shop_order` · loyalty reward expiry job + schedule birthday rewards · consent filters in lifecycle RPCs · `award_loyalty_stamp` locking/idempotency · repair `LoyaltyStamp.jsx` + `BriefDetail`/`CampaignDetail` column bugs · procurement receive fixes · honor `stamp_goal` everywhere · POS RLS via `staff_branches` (activate or delete).

**P2 — month:** delete ~7k lines of dead code (costCalculator module, storefront SPA, orphan pages, backup HTML, dead exports) · rebuild schema baseline (15 missing tables, root SQL files → migrations, move wipe migrations out of chain) · edge-function `_shared/` + consolidate model IDs · retire legacy content pipeline + `/analytics-legacy` · historical cost snapshot on order items · real CapEx depreciation · loyalty liability in exec summary · enforce 2dp display policy · one Instagram handle, one passport, one challenge system, one FX table · unit tests for money math/GL/RLS.

## 8. What's Genuinely Good

The May hardening work landed properly: order creation is atomic and idempotent, shift totals race-safe, EOD reconciles, PIN auth is real, audit logging exists on every mutation, DB money is `numeric` throughout, the GL double-entry skeleton (trigger chain, idempotent sync) is well designed, margin formulas everywhere are correct (margin not markup), the overtime/labor view math is verified right, spin-wheel probability math is exact, and the content studio's draft versioning + dialect injection actually reaches the prompt. **The failure pattern is not architecture — it's drift:** columns renamed without updating writers, features shipped against tables that were never migrated, settings made configurable while displays stayed hardcoded, and copy-pasted SQL whose filters landed in the wrong clause.
