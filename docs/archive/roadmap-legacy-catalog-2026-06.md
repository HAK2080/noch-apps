# Noch Cafe V2 legacy catalog (2026-06)

This note records legacy surfaces and duplicate setup material that were reviewed during roadmap execution.
Nothing listed here was deleted from production data or from the repository.

## Canonical routes

- `/finance` is the canonical analytics and finance entry point.
- `/analytics-legacy` now redirects to `/finance` as a safe compatibility alias.
- `/content-studio/*` remains the canonical Content Studio v2 surface.

## Deprecated routes now redirected to v2

- `/content`
- `/content/studio`
- `/content/brand/setup`
- `/content/brands/new`
- `/content/brand/:id`
- `/content/review`
- `/content/ideas`
- `/content/create`
- `/content/research`
- `/content/calendar`
- `/content/experiments`

These routes no longer render the legacy Content Studio v1 UI directly. They now redirect into the supported `/content-studio/*` surfaces so v2 remains canonical without deleting the old implementation files from the repo.

## Expense and finance consolidation

- `expenses` remains the canonical workflow table for approvals and payments.
- `expense_entries` is retained for backward compatibility and historical reads.
- `finance_expense_documents` is the additive read model used to consolidate both sources without destructive migration.

## Manual setup artifacts retained for archive/reference

- [`EXPENSES_SETUP.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/EXPENSES_SETUP.sql)
- [`INVENTORY_ALERTS_SETUP.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/INVENTORY_ALERTS_SETUP.sql)
- [`RECIPES_MODULE_SETUP.md`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/RECIPES_MODULE_SETUP.md)

These are treated as historical/manual setup material and should not be used as the source of truth over current Supabase migrations.
