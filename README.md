# Noch Apps

Monorepo for **Noch**, a multi-branch café management system (Tripoli, Libya).
Two React + Vite single-page apps share one Supabase backend and a single
root `.env`.

| App | Folder | Domain | Audience |
|---|---|---|---|
| **POS + dashboard** | [`apps/pos/`](apps/pos) | `apps.noch.cloud` | Staff (POS, inventory, finance, loyalty, …) + customers (menu/checkout pages) |
| **Storefront** | [`apps/storefront/`](apps/storefront) | `noch.cloud` | Customers (Hub, Menu, Shop, Loyalty landing) |

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

Deployment is handled by [`deploy.py`](deploy.py) (requires Python +
`paramiko`). It builds the app and uploads `dist/` to the VPS.

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

`git push` only saves code to GitHub — it does **not** deploy. Deploys go
through `deploy.py`.

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
  `20260718180500`–`180700`, `20260718190000`–`190200`, plus the branch's
  `20260718170000`–`182000`. Verify which of the ~20 branch migrations are
  already applied before running any.
- **Set `WHATSAPP_CRON_SECRET`** and re-schedule the pg_cron job with the
  `x-cron-secret` header — until then the nightly WhatsApp run gets 403.
- **Set `TELEGRAM_WEBHOOK_SECRET`** and re-register the webhook (GET the
  function URL once) so Telegram signs updates.
- **Verify `pos_coupons` exists in prod** — coupons are server-side now, but
  the table exists in no migration; orders with a code fail if it's missing.
- Set shift hourly rates — labor is 0 in every P&L, so prime cost is
  understated everywhere.
