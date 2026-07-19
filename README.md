# Noch Apps

Monorepo for **Noch**, a multi-branch café management system (Tripoli, Libya).
Two React + Vite single-page apps share one Supabase backend and a single
root `.env`.

| App | Folder | Domain | Audience |
|---|---|---|---|
| **POS + dashboard** | [`apps/pos/`](apps/pos) | `apps.noch.cloud` | Staff (POS, inventory, finance, loyalty, …) + customers (menu/checkout pages) |
| **Storefront** | [`apps/storefront/`](apps/storefront) | `noch.cloud` | Customers (Hub, Menu, Shop, Loyalty landing) |

```
Noch_apps_June_2026/
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
