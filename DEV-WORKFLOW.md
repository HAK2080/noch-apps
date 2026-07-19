# Development Workflow

## Overview

```
Local dev (staging DB)  →  Test & verify  →  Deploy to live  →  Save to GitHub
     npm run dev:staging        localhost:5173      python deploy.py apps      git push
```

The POS app is at **apps.noch.cloud**; the storefront is at **noch.cloud**
(`python deploy.py storefront`). The staging Supabase project is just a safe
test database used during development.

> `deploy.py` is what actually puts code live (it builds and SFTP-uploads
> `dist/` to the VPS). `git push` only saves your code to GitHub — it does
> **not** trigger a deploy. There is no CI/CD auto-deploy.

---

## One-time setup (do this once)

### 1. Create the staging Supabase project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project** → name it `noch-staging` → choose the free tier
3. Wait ~2 minutes for it to provision

### 2. Fill in `.env.staging`
1. In the staging project → **Settings → API**
2. Copy **Project URL** and **anon public** key
3. Open `.env.staging` at the repo root and paste them in:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

### 3. Apply all migrations to staging
Link Supabase CLI to the staging project and run all migrations:
```bash
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
npx supabase db push
```
The project ref is the ID in your staging project URL (e.g. `xxxxxxxxxxxx`).

---

## Daily workflow

### Developing a new feature

```bash
# 1. Start local dev server against staging DB
cd apps/pos
npm run dev:staging
# Opens at http://localhost:5173
# All data reads/writes go to staging — production is untouched

# 2. Build & test the feature
# Make changes, break things, fix them — staging DB is disposable

# 3. When ready to go live — deploy to production
cd ../..
python deploy.py apps          # builds against production .env + uploads to apps.noch.cloud
#   python deploy.py storefront  # for the noch.cloud landing
#   python deploy.py both        # both apps, in order

# 4. Save the code to GitHub (does NOT deploy — deploy.py already did)
git add -A
git commit -m "feat: your feature description"
git push
```

### Adding a database migration

> ⚠️ **Do NOT run `supabase db push` against production.** The local
> `supabase/migrations/` folder and the live DB have diverged — `db push`
> would try to apply dozens of unpushed local migrations at once. Apply your
> **single** new migration file instead (Supabase dashboard SQL editor, or a
> targeted `psql -f`), so only your change lands.

```bash
# 1. Write the migration as supabase/migrations/<timestamp>_<name>.sql

# 2. Test on staging (a fresh staging DB can take `db push` safely)
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
npx supabase db push

# 3. Verify the feature works against staging

# 4. Apply to PRODUCTION — only this one file:
#    Open the Supabase dashboard (project kxqjasdvoohiexedtfqw)
#    → SQL Editor → paste the contents of your migration file → Run.
#    (Or: psql "$PROD_DB_URL" -f supabase/migrations/<your-file>.sql)

# 5. Deploy the code (same as above)
```

---

## Quick reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Local dev → **production DB** (careful!) |
| `npm run dev:staging` | Local dev → **staging DB** (safe) |
| `npm run build` | Production build |
| `python deploy.py apps` | Build + deploy apps.noch.cloud |
| `python deploy.py storefront` | Build + deploy noch.cloud |
| `python deploy.py both` | Deploy both apps, in order |
| `git push` | Save to GitHub (does **not** deploy) |

---

## Project credentials

| | URL | Where to find keys |
|--|--|--|
| **Production** | apps.noch.cloud | `.env` at repo root |
| **Staging** | localhost:5173 | `.env.staging` at repo root |

Both `.env` and `.env.staging` are gitignored — never committed.
