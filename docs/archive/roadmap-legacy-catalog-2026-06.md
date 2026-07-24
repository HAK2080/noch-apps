# Noch Cafe V2 legacy catalog (2026-06, updated 2026-07-21)

This note records legacy surfaces and duplicate setup material that were reviewed during roadmap execution.
Nothing listed here was deleted from production data or from the repository.

## Canonical routes

- `/finance` is the canonical analytics and finance entry point.
- `/analytics-legacy` now redirects to `/finance` as a safe compatibility alias.
- `/content-studio/*` remains the canonical Content Studio v2 surface.
- `/accounting` is the active accounting surface for AP aging, supplier statements, cash flow, and P&L drill-down.

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

## Legacy implementation files kept in-place

- `apps/pos/src/pages/BusinessAnalytics.jsx` remains in the repo as historical glue/reference, but the live route now redirects to `/finance`.
- `apps/pos/src/pages/content/*` remains preserved for rollback/reference, but those v1 pages are no longer routed directly.
- `apps/pos/src/modules/contentStudio/*` is the supported live implementation.

## Expense and finance consolidation

- `expenses` remains the canonical workflow table for approvals and payments.
- `expense_entries` is retained for backward compatibility and historical reads.
- `finance_expense_documents` is the additive read model used to consolidate both sources without destructive migration.
- Older finance planning/setup notes may still mention `expense_entries` as the primary Finance source. Treat current Supabase migrations plus [`apps/pos/src/modules/finance/tabs/ExpensesTab.jsx`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/apps/pos/src/modules/finance/tabs/ExpensesTab.jsx) as the current source of truth.

## POS hardening status

- Staff identity capture is now wired for sale, refund, void, discount override, and shift-close flows through the active POS RPC/client path.
- Manager override audit is additive and active via `annotate_pos_sale_override(...)`.
- Shift-close attribution is additive and active via `annotate_shift_close_operator(...)`.
- POS RLS tightening remains partially blocked. The legacy broad `pos_all` policies are still intentionally open on:
  - `pos_branches`
  - `pos_categories`
  - `pos_products`
  - `pos_shifts`
  - `pos_orders`
  - `pos_order_items`
  - `pos_inventory_movements`
- Additional broad authenticated policies also remain on some operational tables (`pos_settings`, `pos_cash_movements`, `pos_shift_attendees`, modifier-link tables, procurement event tables). These were reviewed but not auto-tightened because branch-scoped staff assignment coverage is still an unsafe/ambiguous dependency for live production traffic.

## Manual setup artifacts retained for archive/reference

- [`docs/archive/manual-setup/EXPENSES_SETUP.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/docs/archive/manual-setup/EXPENSES_SETUP.sql)
- [`docs/archive/manual-setup/INVENTORY_ALERTS_SETUP.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/docs/archive/manual-setup/INVENTORY_ALERTS_SETUP.sql)
- [`docs/archive/manual-setup/RECIPES_MODULE_SETUP.md`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/docs/archive/manual-setup/RECIPES_MODULE_SETUP.md)
- [`supabase/schema_recipes.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/supabase/schema_recipes.sql)
- [`supabase/fix-recipes-table.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/supabase/fix-recipes-table.sql)
- [`supabase/fix-recipes-smart.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/supabase/fix-recipes-smart.sql)
- [`supabase/recipes_seed.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/supabase/recipes_seed.sql)
- [`scripts/exec-sql.js`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/scripts/exec-sql.js)
- [`scripts/migrate-recipes.js`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/scripts/migrate-recipes.js)
- [`docs/finance/01-mvp-plan.md`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/docs/finance/01-mvp-plan.md)
- [`docs/finance/02-mvp-shipped.md`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/docs/finance/02-mvp-shipped.md)

These are treated as historical/manual setup material. They are preserved for rollback/reference, but they should not be treated as the source of truth over current Supabase migrations, current route wiring, or the additive roadmap smoke checks in [`scripts/roadmap_db_smoke.sql`](/C:/Users/aeroh/AI%20apps/Noch_apps_June_2026/Noch%20Cafe%20V2/scripts/roadmap_db_smoke.sql).
