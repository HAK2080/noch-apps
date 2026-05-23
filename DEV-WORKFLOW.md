# Development Workflow

## Overview

```
Local dev (staging DB)  →  Test & verify  →  Deploy to live
     npm run dev:staging        localhost:5173      npm run build
                                                    python deploy.py apps
                                                    git push origin main
```

Production is always at **apps.noch.cloud** — nothing changes about how you deploy.
The staging Supabase project is just a safe test database used during development.

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
npm run build                  # builds against production .env
cd ../..
python deploy.py apps          # uploads to apps.noch.cloud
git add -A
git commit -m "feat: your feature description"
git push origin main
```

### Adding a database migration

```bash
# 1. Test on staging first
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
npx --no supabase db query --linked -f supabase/migrations/YOUR_MIGRATION.sql

# 2. Verify the feature works against staging

# 3. Apply to production
npx supabase link --project-ref kxqjasdvoohiexedtfqw   # production ref
npx --no supabase db query --linked -f supabase/migrations/YOUR_MIGRATION.sql

# 4. Deploy the code (same as above)
```

---

## Quick reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Local dev → **production DB** (careful!) |
| `npm run dev:staging` | Local dev → **staging DB** (safe) |
| `npm run build` | Production build |
| `python deploy.py apps` | Deploy to apps.noch.cloud |
| `git push origin main` | Save to GitHub |

---

## Project credentials

| | URL | Where to find keys |
|--|--|--|
| **Production** | apps.noch.cloud | `.env` at repo root |
| **Staging** | localhost:5173 | `.env.staging` at repo root |

Both `.env` and `.env.staging` are gitignored — never committed.
