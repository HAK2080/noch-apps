# Repository Guidelines

## Agent Coordination

Before starting any task, every agent must:

1. Read `AGENT_COORDINATION.md` and search `COMPLETED_WORK.md`.
2. Run `git status` and preserve all active work from other agents.
3. Search the current code and recent Git history before deciding to build.
4. Treat code and Git history as authoritative if the work log is stale.
5. Do not edit a file another agent is actively changing without an explicit handoff.
6. After completing work, record the files, agent, verification, commit, and deployment status in `COMPLETED_WORK.md`.

When agents share one workspace, edits to the same file must be sequential, never concurrent.

Unless the user explicitly requests local-only work or says not to deploy, a code change is
not complete until it is verified, committed and pushed to GitHub, its required database
migrations and Edge Functions are deployed, and the relevant production site is verified.

## Project Structure

This is a small monorepo for Noch Apps:

- `apps/pos/` — authenticated staff/owner ERP: POS, finance, accounting, inventory, recipes, loyalty, marketing, tasks, and operations.
- `apps/storefront/` — customer-facing menu, shop, loyalty, and ordering UI.
- `supabase/` — database schema, timestamped migrations, seed data, and Edge Functions.
- `docs/` — architecture notes, feature plans, audits, QA, and research.
- `scripts/` — migration, seed, deployment, and maintenance helpers.
- `tests/` and `apps/pos/tests/` — repository and Playwright coverage.

Keep domain data access in the owning module (for example, `apps/pos/src/modules/finance/lib/`) rather than expanding the legacy `src/lib/supabase.js` kitchen sink.

## Development Commands

Run commands from the relevant app directory:

```powershell
cd apps/pos
npm run dev             # local POS app
npm run build           # production build
npm run build:staging  # staging build
npm run lint            # ESLint
npx playwright test     # end-to-end tests
```

For the storefront, use `cd apps/storefront; npm run dev` or `npm run build`. Database changes belong in a new `supabase/migrations/YYYYMMDDHHMMSS_description.sql` file; do not edit an applied migration.

## Coding Style

Use JavaScript/JSX with two-space indentation, single quotes, semicolons omitted, and descriptive camelCase names. React components and page files use PascalCase; helpers use camelCase; migrations use timestamped snake-case descriptions. Prefer small, domain-owned modules and existing Tailwind/classes over introducing new styling systems.

## Testing Guidelines

Run the POS build and targeted ESLint before submitting changes. Add or update Playwright specs for login, role/permission, POS, and critical owner workflows. Test money, date boundaries, branch filters, refunds, cash movements, and accounting invariants explicitly. Do not treat a successful build as proof that Supabase migrations or RLS policies work; verify those against a configured database.

## Commits and Pull Requests

Use imperative Conventional Commit-style messages, such as `feat(finance): add branch summary` or `refactor(pos): extract session helpers`. Keep commits focused. Pull requests should explain the user impact, list migrations/config changes, include verification commands, call out known data/RLS risks, and attach screenshots for UI changes. Never commit `.env` values, service-role keys, customer data, or generated deployment artifacts.
