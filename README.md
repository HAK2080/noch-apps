# Noch Apps

Monorepo for Noch — café management platform (Tripoli, Libya).

## Structure

| App | Serves | What it is |
|---|---|---|
| `apps/pos/` | **apps.noch.cloud** | Admin + POS SPA (React/Vite): tasks, POS terminal, sales reports, finance, accounting, loyalty (Nochi), inventory, expenses, content studio, marketing, ops |
| `apps/storefront/` | **noch.cloud** | Customer storefront: menu, online shop, loyalty passport |
| `supabase/` | — | Migrations + edge functions (project `kxqjasdvoohiexedtfqw`) |

`apps/pos` modules: pos, finance, accounting, loyalty, contentStudio, costCalculator, marketing, ops.

## Deploy

```bash
python deploy.py apps         # build + upload apps.noch.cloud
python deploy.py storefront   # build + upload noch.cloud
python deploy.py both
```

Edge functions: `supabase functions deploy <name>` (CLI is linked to the project).
SQL migrations are applied manually (SQL editor) — files in `supabase/migrations/` are the record.

> ⚠️ The GitHub Actions workflows (`deploy-admin.yml` / `deploy-storefront.yml`) still
> target the OLD `backend/`+`storefront/` layout on `master`. Production deploys from
> THIS branch's layout via `deploy.py`. Do not push this layout's changes to `master`
> expecting CI to deploy them — and do not let CI deploy `master` over production.

## Conventions that keep the data correct

- **Business day = 5 AM → 5 AM Africa/Tripoli.** Cafés trade 9 AM to ~1 AM, so
  post-midnight sales belong to the evening's trading day. Enforced in the
  `pos_sales_daily` view (migration `20260717120000_business_day_sales.sql`) and in
  `businessToday()` / `businessDayWindow()` in `apps/pos/src/modules/pos/lib/pos-supabase.js`.
  Every sales/finance screen must use these helpers for date ranges.
- **Never derive a local date via `toISOString()`** — Libya is UTC+2; that shifts the
  date to the previous day before 2 AM (this bug once made "Today" report 3 days
  of sales). Format dates from local components (see `localYmd()`).
- Long-press on a product in the POS terminal toggles `is_sold_out`: shaded for
  staff, hidden from the customer menu and online store.

## Receipt Snap (Noch 5.0)

Photo-only expense submission for staff — Telegram bot (@noch_bot) + installable
PWA. Edge functions `expense-snap` + `telegram-webhook`; extraction chain
Gemini (free) → Claude → manual. See `RECEIPT_SNAP_SETUP.md` on branch
`claude/file-inspection-9df8a8` (frontend port to `apps/pos` pending).
