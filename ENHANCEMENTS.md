# Noch Apps — Audit & Enhancement Register
_Compiled 2026-07-18 from a full-code audit of accounting, finance, reporting, sales, POS, inventory, expenses, and loyalty._

Legend: ✅ verified correct · 🔧 fixed during audit · 🔴 bug/open · 🟠 improvement · 🔵 question for owner

---

## 0. Repo / deploy (blocks everything)

- 🔴 **P0 — Split-brain branches.** Production runs `perf/cold-load-chunk-splits`
  (Management Report, popularity sort, chunk-split build); working branch
  `refactor/pos-architecture` holds the ExpensesPage split, domain-lib refactor,
  and all 2026-07-17/18 sales-accuracy fixes. Diverged 2026-06-14 (14 vs 6 commits).
  **Merge before any deploy** — deploying either branch alone loses the other's features.
- 🟠 P1 — Stale CI: `deploy-admin.yml`/`deploy-storefront.yml` deploy the OLD
  `backend/` layout from `master`. A push to master would overwrite production
  with v3.6. Retarget or disable the workflows.
- 🟠 P1 — Root SSH password is hardcoded in `deploy.py` and pushed to GitHub. Rotate,
  move to env/secret.
- 🟠 P2 — `master`, `main`, `june-2026` are stale twins; archive after the merge.

## 1. Sales & POS reporting

- 🔧 "Today showed 3 days" — double UTC date-shift in POSReports (fixed).
- 🔧 22 `toISOString()` local-date bugs across reports/finance/tasks/marketing (fixed).
- 🔧 `pos_sales_daily` now buckets by **business day 5 AM→5 AM Africa/Tripoli**
  (applied live; migration `20260717120000`). Client helpers `businessToday()` /
  `businessDayWindow()` are the single source of truth.
- 🔧 Sales landing: per-branch + grand totals with presets (was navigation-only).
- 🔧 Sessions: date-range picker replaces hardcoded "last 60"; refund
  reconciliation + gap display added (parallel session).
- 🔴 P1 — **POSReports tiles omit `split_sales`**: split-payment orders appear in
  Gross but in neither Cash nor Card tile → tiles ≠ gross. Add Split (or split
  into true cash/card portions in the view using `card_amount`). Add a Refunds tile
  to match Sessions.
- ✅ Offline order sync is idempotent (`idempotency_key`); voids reverse stock atomically.
- 🟠 P2 — Four separate date-range picker implementations (POSReports, Sessions,
  Sales, finance PeriodSelector). Extract one shared `<RangePicker>` (business-day aware).
- 🟠 P2 — Presto shows 0.00 everywhere; hide the tile/method until the integration is live.

## 2. Finance module (11 tabs)

- 🔧 Period presets now business-day aware (PeriodSelector, Daily P&L, Expenses,
  Executive Summary).
- ✅ `finance_pnl` + GL RPC windows land on 2 AM local (UTC midnight) — inside the
  closed 2–5 AM gap, so they agree with the 5 AM business day in practice.
- 🟠 P1 — **COGS trusts `pos_products.cost_lyd`**; any product without a cost
  silently inflates margins. Add a "products missing cost" widget (count + list)
  on Daily P&L; nudge to RecipeLinkerTab.
- 🟠 P2 — `net_of_refunds` defaults OFF in Daily P&L; consider defaulting ON or
  showing both.
- 🟠 P2 — Three FX sources (`cc_exchange_rates`, finance USD reference,
  `currency_rates`). Unify to one table with one updater.

## 3. Management Report (lives on perf branch, `/expenses`)

- 🔴 P1 — **"Net after expenses" mixes timeframes**: subtracts raw 30-day expense
  entries (60k rent, bulk Dubai buys = capital/prepaid) from 30-day sales →
  reads as −129k "loss". Add opex/capex split (finance module already has it)
  or amortize period expenses; label clearly.
- 🟠 P1 — No branch filter/label; totals are cross-branch without saying so.
- 🟠 P2 — Consolidation: Management Report = daily owner page; Finance = deep dive;
  retire `analytics-legacy` (BusinessAnalytics) after confirming nothing unique.

## 4. Accounting (GL)

- ✅ Day boundary consistent (see §2).
- 🔵 P1 — GL entries are created as **draft** — is anyone reviewing/posting them?
  If not, either automate posting after N days or park the module until needed.
- 🟠 P2 — `gl_sync_period` day loop should eventually share the business-day
  definition if late-night trading ever passes 2 AM.

## 5. Inventory

- ✅ Two-layer model verified: `pos_products.stock_qty` auto-decremented by sales
  (atomic, void-reversible) for retail; `ingredients`/`stock` manual counts +
  alert prefs for raw materials; weekly stock-check reminders create tasks.
- 🔴 P1 — Management Report shows core ingredients at 0 g (Matcha, Taro…) while
  trading continues → counts are stale, alerts cry wolf. Fix the workflow, not
  the code: **theoretical stock** = last count − recipe-based consumption since
  (RPC `get_ingredient_consumption` already computes usage). Show
  theoretical vs counted variance at each stock check.
- 🟠 P2 — Procurement suggestions exist (same-weekday demand forecast in POSReports);
  link "below min" ingredients directly to a one-tap procurement order draft.

## 6. Expenses

- 🔧 Receipt Snap shipped (Telegram bot + PWA `/snap`, Gemini-free extraction,
  branch buttons, splits, manual text entries). Functions + DB live; PWA page
  needs porting into `apps/pos` after the branch merge.
- 🔧 `expense_date` no longer defaults to yesterday before 2 AM.
- 🔴 P1 — **43 approved-unpaid expenses**: approval flow works, payment is the
  bottleneck. Schema already has `paid_at`/`payment_account_key` — add batch
  "mark paid" with account picker in ApproveTab.
- 🟠 P1 — Cost centers (CC01 City Walk…) vs POS branches (Hay Alandlous, Jaraba)
  naming drift — add `pos_branch_id` to `cost_centers` so expense and sales
  reports can join.
- 🟠 P2 — Expense categories (11) vs finance opex categories (rent/utilities/…)
  are separate taxonomies; map them so P&L opex lines break down cleanly.

## 7. Loyalty (Nochi) — from 2026-07-18 analysis

- 🔴 **P0 — Attaching a card at checkout does NOT award a stamp** (order RPC stores
  `loyalty_customer_id` and stops). Award server-side in the order RPC,
  idempotent per order. This single change converts the existing checkout flow
  into the loyalty flow. (~59 members / <1% of orders today.)
- 🟠 P1 — PaymentModal: phone-digits quick attach by default; auto-create member
  from phone only.
- 🟠 P1 — Receipt footer: stamps-progress line + Passport QR (ESC/POS lib exists).
- 🟠 P1 — Staff leaderboard for signups/stamps (`awarded_by` already recorded).
- 🟠 P2 — Win-back automation via existing whatsapp-cron (lapsed 14 days).
- 🟠 P2 — Dashboard KPI: **attach rate** (% orders with loyalty_customer_id),
  repeat-visit rate — not member count.

## 8. Module verdicts (audit opinion, 2026-07-18)

| Module | Grade | Verdict |
|---|---|---|
| POS terminal | **A−** | Best-engineered part: idempotent offline sync, atomic stock+shift, void reversal, PIN + rate limiting. Leave it alone. |
| Sales reporting | **B+** (was F) | Was lying ("Today" = 3 days); trustworthy after fixes once deployed. Split tiles = last honesty gap. |
| Expenses | **B+** | Good schema + approvals; Receipt Snap solves capture. Payment end of the pipeline has no workflow. |
| Finance | **B−** | Strong math engine, ungoverned inputs (product costs, refunds toggle, 3 FX sources). |
| Inventory | **C+** | Retail stock solid; ingredient counts stale → noise not signal. |
| Accounting (GL) | **C** | Correct double-entry, probably unused (draft limbo). Make it real or park it. |
| Loyalty | **B+ build / D outcome** | Great engine, not connected to checkout — <1% of orders. |
| Tasks/Staff | **B** | Works, used daily. |
| Content/Marketing | **C+** | Most sprawl per unit of value (3 overlapping systems). |

Overall: capability outran integration, data discipline, and cleanup — not a
missing-features problem.

## 9. Overlaps (consolidation targets)

- Five reporting surfaces (POS Reports / Sales / Finance / Accounting /
  Management Report + analytics-legacy) answering the same question.
- Two expense tables (`expense_entries` + `expenses`) UNIONed inside finance_pnl —
  one should absorb the other.
- Two content systems (legacy /content + Content Studio 2.0) + marketing module.
- Three FX sources; two category taxonomies; two branch identity systems
  (cost centers vs pos_branches).
- Three "intelligence/alerts" implementations (businessEvents, Loyalty
  Intelligence, Inventory Intelligence).
- Four date-range pickers; duplicated badge components; old `backend/` codebase
  still in the repo beside `apps/`.

## 10. Missing pieces (highest leverage first)

1. **5 AM auto-close report to Telegram** — per-branch gross/cash/card, vs last
   week, top products, stamps, expenses snapped. Replaces daily dashboard-checking;
   all plumbing (Telegram, business-day boundary, daily view) already exists.
2. **Checkout as the integration hub** — a completed sale should fire loyalty
   stamp + recipe-based ingredient depletion + real COGS. Today only retail
   stock updates.
3. **Data-quality governance** — products-missing-cost check, stale-stock-count
   detector, FX-rates-last-updated indicator; the system should police its inputs.
4. **Payment/settlement workflow** — approve → pay → reconcile against BankTab.
5. **Tests, error monitoring, backups** — none exist; smoke tests + Sentry +
   scheduled DB dump would transform risk.
6. **Staff scheduling/rota** — labor is measured (clock-ins) but never planned;
   demand forecast exists but doesn't drive the roster.
7. **One truth branch + boring deploys** — prerequisite for everything above.

Top three by leverage: **branch merge, checkout-as-hub, 5 AM close report.**

## 11. Vestaboard+ replica — "Noch Channels" (proposed, $0/yr)

Current state: Vestaboard integration is manual-only (admin types → queue → send).
No automation feeds it. Code already supports BOTH cloud R/W API (paid key) and
the FREE Local API (`VITE_VESTABOARD_HOST`) — cloud app can't reach LAN, so a
POS terminal (always on, same Wi-Fi) should act as the send bridge.

Hardware constraint (due diligence): 64-flap charset — UPPERCASE A–Z, 0–9,
basic punctuation, 8 color chips. **No Arabic / lowercase / emoji.** Content
must be English/transliterated; colors via the `characters` 6×22 grid mode
(the existing 132-char truncation = 6×22).

Replicating the Vestaboard+ feature set for free:
- **Channels table** `vestaboard_channels`: type, enabled, cadence, time
  windows, priority → the "playlist" scheduler.
- **vestaboard-cron edge function** (15–30 min): picks due channel, composes
  message, enqueues into existing `vestaboard_messages`, bridge sends.
- Channel lineup (all free): English jokes/quotes/trivia batch-generated on
  Gemini free tier; Open-Meteo Tripoli weather (color-bar design); English RSS
  news; football-data.org scores; USD→LYD from own `cc_exchange_rates`; prayer
  times (Aladhan API — numeric + EN labels render fine); optional Spotify
  now-playing (free API).
- **Noch-native channels Vestaboard+ can't sell**: today's special, new product,
  sold-out notices, loyalty reward shoutouts ("MABROUK SARA!"), order
  milestones, weekly leaderboard star, staff birthdays.
- Admin: "Channels" tab on the existing Vestaboard page — toggles, cadence,
  6×22 preview; manual messages jump the queue.
- Savings: Vestaboard+ subscription + (via Local API bridge) the R/W cloud key.
- Bonus: a wall-TV web page with CSS split-flap animation can mirror the same
  queue for the branch without a physical board.

## Suggested execution order

1. Merge perf ↔ refactor (after in-flight session commits) → single truth branch
2. POSReports Split + Refunds tiles (§1)
3. Management Report opex/capex-aware Net + branch label (§3)
4. Deploy `apps` + `storefront` → all accuracy fixes live
5. Loyalty auto-stamp P0 (§7) + batch mark-paid (§6)
6. Port Receipt Snap PWA into `apps/pos`
7. P2 backlog: shared RangePicker, FX unification, theoretical stock, consolidation
