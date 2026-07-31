# Noch Apps

Monorepo for **Noch**, a multi-branch café management system (Tripoli, Libya).
Two React + Vite single-page apps share one Supabase backend and a single
root `.env`.

| App | Folder | Domain | Audience |
|---|---|---|---|
| **POS + dashboard** | [`apps/pos/`](apps/pos) | `apps.noch.cloud` | Staff (POS, inventory, finance, loyalty, …) + customers (menu/checkout pages) |
| **Storefront** | [`apps/storefront/`](apps/storefront) | `noch.cloud` | Customers (Hub, Menu, Shop, Loyalty landing) |

## Current release highlights

- **Owner reporting:** `/report` and Finance use one Tripoli-business-day
  reporting model for net sales, payment reconciliation, direct profit, shared
  costs, and fully loaded operating profit. Missing or stale evidence stays
  visible instead of becoming zero.
- **Loyalty V2:** privacy-first transaction QR capture with retained masked
  cashier lookup fallback, an explicit linked/skipped decision for every
  online order, verified channel consent, owner-only masked customer
  management, auditable opening balances from V1, missions, reward
  obligations, refund/void reversals, and a read-only V1 archive.
- **Inventory control:** branch and warehouse product quantities use the
  location stock ledger; POS receiving, adjustments, sales reversals,
  transfers, and waste create auditable location movements. Ingredient
  estimates require explicit recipes, and missing/stale evidence is shown
  instead of converted to zero.
- **Expenses:** submitters report unpaid, paid cash, or paid card before owner
  approval; Receipt Snap and Telegram follow the same accounting workflow.
- **Finance:** owner-facing navigation and headline metrics use plain business
  language while retaining accounting terms such as COGS where useful.
- **Sales and cash control:** `/sales` is the owner control view for Tripoli
  business-day sales and tender reconciliation; shift closeouts derive expected
  drawer cash from an immutable tender-event ledger and keep missing counts
  visibly missing. Card settlement remains unavailable until an external
  processor or bank statement source is connected.
- **Workforce control:** `/staff` is the owner control point for the employee
  directory, attendance evidence, weekly schedules, and payroll. Open
  attendance is excluded from paid hours, draft payroll is excluded from actual
  profit, and payroll approval is separated from payment.
- **Content Studio measurement:** `/content-studio/performance` is the
  owner-only publishing and evidence workflow. Approved assets become explicit
  publication records with objective, product, campaign, spend, and fixed
  24-hour/7-day snapshots. Associated orders and revenue are never presented as
  causal lift without a recorded experiment and control.
- **Access and acceptance:** navigation and direct URLs use the same role
  policy, denied access fails closed with an English/Arabic explanation, and
  mobile users can reach every granted page. Full profile rows are owner-or-self;
  POS and staff pickers use a safe directory that excludes contact, PIN, payroll,
  and access-control fields.

## Current operating-readiness exceptions

The software reports these as owner actions; they are not silently filled with
estimates:

- Complete 79 ingredient location counts, resolve 5 negative product-location
  balances, and link explicit recipes for sold products.
- Enter 9 missing employee start dates, then record attendance and publish a
  schedule before regenerating the unreconciled July payroll draft.
- Start post-launch loyalty capture and member self-linking; the 30% day-30 and
  50% day-90 targets do not yet have an eligible post-launch order cohort.
- Record Content Studio publications and 24-hour/7-day evidence snapshots.
- Connect card/Presto settlement or bank-statement evidence; POS tenders
  reconcile, but processor settlement is still unavailable.


```
Jul 26 release/
├── apps/
│   ├── pos/           ← apps.noch.cloud (POS + dashboard SPA)
│   └── storefront/    ← noch.cloud (customer landing)
├── packages/
│   └── shared/        ← reserved for shared assets/utils (currently a scaffold)
├── supabase/          ← one database; migrations + edge functions for both apps
├── docs/              ← living docs (see docs/PAGES.md for the route map)
├── deploy.py          ← builds + uploads each app to the VPS
└── .env               ← single source of truth; both apps read it (gitignored)
```

## Stack

- **Frontend:** React + Vite (POS uses React 19; the storefront landing
  loads React from a CDN — see [`apps/storefront`](apps/storefront)).
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions),
  project ref `kxqjasdvoohiexedtfqw`.
- **Hosting:** a single VPS running nginx behind Traefik. `deploy.py`
  uploads each app's `dist/` over SFTP.

## Develop

Both apps read the **root `.env`** (each `vite.config.js` sets
`envDir: '../..'`). Don't create per-app env files.

```bash
cd apps/pos        # or apps/storefront
npm install
npm run dev            # POS: dev server against the PRODUCTION db — be careful
npm run dev:staging    # POS only: dev server against the staging db (safe)
```

See [`DEV-WORKFLOW.md`](DEV-WORKFLOW.md) for the staging setup and the
day-to-day loop.

## Build & deploy

Production deployment is handled by GitHub Actions on pushes to `main` that
change `apps/pos/**`, or by manually running the **Deploy apps.noch.cloud**
workflow. The workflow builds the POS app and invokes [`deploy.py`](deploy.py)
with repository secrets. Maintainers can also run `deploy.py` locally when
the required SSH credentials are configured.

```bash
python deploy.py apps         # build + deploy apps.noch.cloud
python deploy.py storefront   # build + deploy noch.cloud
python deploy.py both         # both, in order
python deploy.py apps --no-build   # upload an existing dist/ without rebuilding
```

- The POS build (`apps/pos`) code-splits routes and vendor chunks for a
  light initial load; see [`apps/pos/vite.config.js`](apps/pos/vite.config.js).
- The storefront build (`apps/storefront`) runs a precompile step
  ([`scripts/precompile.mjs`](apps/storefront/scripts/precompile.mjs)) that
  transpiles its app ahead of time so the browser doesn't ship/run a JSX
  transpiler at runtime.

Feature branches and pull requests do not deploy automatically. A push to
`main` deploys applicable POS changes; a manual workflow dispatch can deploy
a selected branch for controlled verification.

## Database

One Supabase project backs both apps. SQL migrations live in
[`supabase/migrations/`](supabase/migrations) and edge functions in
[`supabase/functions/`](supabase/functions).

> ⚠️ **Migration drift:** the local `supabase/migrations/` folder and the
> live database have diverged (many local files are unapplied; some applied
> migrations have no local file). **Do not run `supabase db push`** against
> production — it would try to apply every unpushed local migration. Apply a
> single new migration via the Supabase dashboard SQL editor (or a targeted
> `psql -f`) instead. See [`DEV-WORKFLOW.md`](DEV-WORKFLOW.md).

## Performance harnesses

Repeatable perf tooling lives in [`apps/pos/perf/`](apps/pos/perf):
`measure.mjs` (warm route-transition timings), `cold-load.mjs` (eager-JS
audit), `verify-content.mjs`, plus the storefront variants. Each is a
standalone Playwright script run against a `vite preview` server.

## Docs

[`docs/PAGES.md`](docs/PAGES.md) is the page/route inventory and the first
place to look when asked about "a page." Dated files (audits, changelogs,
`*-shipped` reports, QA summaries) are point-in-time records, not living docs.

## Workspace status (for agents)

**This repo (`Jul 26 release`) is the canonical workspace as of 2026-07-19.**
The old `Noch_apps_June_2026` folder is kept only as a recovery backup — do
not work in it. Before making changes, read
[`docs/audit/2026-07-18-full-app-audit.md`](docs/audit/2026-07-18-full-app-audit.md):
a full-system audit with file:line evidence for every known defect.

## Change log

### 2026-07-21 — Central warehouse, transfers, waste tracking
- Migrations `20260719180000` + `20260719190000`: product-level warehouse
  stock (`location_product_stock`), full request → ship → receive transfer
  flow with in-transit visibility and discrepancy capture
  (`inventory_transfers`, computed `inventory_in_transit` view), waste
  reporting RPC with required reasons (used / damaged / lost / thrown away /
  expired / staff meal / count correction), per-branch min/target par
  levels, warehouse stock intake + transfer cancel RPCs.
- New screens: Inventory → Warehouse Stock (with receive form), Branch
  Stock (par editing), Requests, Transfers (ship/receive queues), In
  Transit, Movement History; POS → "Report waste" barista screen (big
  reason buttons) on POS home + terminal menu.
- Research basis: docs/research/2026-07-21-central-inventory-best-practices.md.

### 2026-07-19 — Payroll runs, staff loans, GL posting, cost allocation
- Migration `20260719130000_payroll_runs_and_loans.sql`: monthly payroll
  runs (generate draft from profile salaries + adjustments + loan
  repayments → owner completes). Completion posts GL: Dr 6600 wages /
  Cr 2100 wages payable. `finance_pnl` uses run totals for completed
  months (prorated estimate otherwise; adjustments leg skips completed
  months to avoid double counting).
- Finance → Payroll tab: generate/edit/complete runs, staff loans CRUD.
- Same day (parallel session): derive hourly rate from salary
  (`20260719110000`), shared-services cost allocation
  (`20260719120000` + Allocations tab), `create-staff` edge function.
- Migration `20260719100000` APPLIED to the live DB this day (salary
  proration verified: 10,500 LYD/mo → 2,709.68 for Jul 12–19).

### 2026-07-19 — Payroll capture + prepaid expense amortization
- Migration `20260719100000_payroll_and_prepaid_amortization.sql`:
  monthly salaries now flow into the P&L labor leg (day-exact proration;
  branch allocation by shift-hours share, else consolidated-only). One pay
  path per person: `monthly_salary > 0` → salary path, else hourly path.
- New `labor_adjustments` table (overtime / bonus / deduction) with entry UI
  in Finance → Shifts; hours-based OT already existed (enable it in the
  Shifts tab settings: 8h/day, 1.5×).
- Prepaid expenses: `expenses.coverage_months` + `coverage_start`; the
  expense form has a "Prepaid — spread over months" block and `finance_pnl`
  recognizes the cost day-exact across the coverage window (e.g. 6-month
  rent now spreads over 6 months instead of one).
- Finance drill-down modal: labor splits into Hourly / Salaries /
  Adjustments in the net waterfall and prime-cost views.
- GL intentionally unchanged (cash-basis); prepaid-asset GL accounting is
  future work.

### 2026-07-19 — Finance drill-downs deployed (`0e2b29a`, live)
- Clicking **Revenue / COGS / Net contribution / Prime cost** (cards or
  branch-table cells) opens a period- and branch-scoped breakdown:
  per-product tables, net-contribution waterfall, prime-cost vs target band.
  New: `apps/pos/src/modules/finance/components/FinanceBreakdownModal.jsx`.
- Deployed to apps.noch.cloud via `deploy.py apps` (bundle `index-Cygfrlq_.js`).

### 2026-07-18 — Enhancements branch merged (`13c4190`)
- Merged `codex/enhancements-delivery` (14 commits): finance branch-expense
  allocation + pre-opening status, storefront precompile, POS product
  popularity sort, Bloom branch activation, ~20 migrations, new edge
  functions (`twilio-status-callback`, `vestaboard-cron`).
- One conflict (`telegram-webhook`): kept both webhook-secret verification
  and Receipt Snap callbacks.

### 2026-07-18 — P0 security/correctness hardening (`9778766`)
From the audit's P0 list (full evidence in the audit doc):
- `create_pos_order` no longer callable by `anon`; guest orders pre-validate
  items (no orphan rows), enforce qty 1–50, unique pickup codes, sequence
  order numbers, branch/menu visibility, stock decrement on pickup confirm.
- POS loyalty stamps actually credit customers (was a silent no-op on a
  nonexistent column) + reward rollover + idempotent backfill; voids reverse
  stamps and restock only tracked, un-refunded quantities.
- `refunded_amount_lyd` maintained on refunds (+ re-backfill) — refunds were
  invisible to finance/GL since 2026-05-08.
- GL reports filter by date/branch/status correctly (JOIN bug); income
  statement no longer adds discounts/refunds to revenue; Presto posts to
  `1025 presto_clearing` instead of cash.
- `marketing_campaigns` CHECK constraints widened (feature was fully blocked).
- Edge functions: role checks on `send-whatsapp`, `send-telegram`,
  `loyalty-stamp`, `extract-inventory`; `verify_jwt=true` for the AI
  functions; shared-secret gates on `whatsapp-cron` and `telegram-webhook`.
- Menu checkout passes coupons to the server (`p_coupon_code`).

### Pending ops (do these on the server / dashboard)
- **Apply migrations to the live DB** (app dashboard SQL editor, one at a
  time — see the drift warning above): `20260718160000`,
  `20260718180500`–`180700`, `20260718190000`–`190200`, ~~`20260719100000`~~
  (applied 2026-07-19), `20260719110000`, `20260719120000`,
  `20260719130000`, plus the branch's `20260718170000`–`182000`. Verify
  which are already applied before running any.
- **Set `WHATSAPP_CRON_SECRET`** and re-schedule the pg_cron job with the
  `x-cron-secret` header — until then the nightly WhatsApp run gets 403.
- **Set `TELEGRAM_WEBHOOK_SECRET`** and re-register the webhook (GET the
  function URL once) so Telegram signs updates.
- **Verify `pos_coupons` exists in prod** — coupons are server-side now, but
  the table exists in no migration; orders with a code fail if it's missing.
- Set shift hourly rates — labor is 0 in every P&L, so prime cost is
  understated everywhere.
