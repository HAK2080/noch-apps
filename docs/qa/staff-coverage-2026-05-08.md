# Staff-level coverage by inspection (2026-05-08)

I don't have staff credentials, so this is a static audit of route guards (`ProtectedRoute`, `OwnerRoute`) + permission gates (`usePermission`) — not a live walk-through. Catches gating bugs without needing a staff login.

## Owner-only routes (blocked from staff via `OwnerRoute`)

A staff user navigating to any of these gets a `Navigate to="/my-tasks"` redirect:

| Route | Page | Notes |
|---|---|---|
| `/tasks` | Tasks board | All-task view, owner only |
| `/staff` | Staff list | Hire/fire surface |
| `/staff/roles` | RoleManager | Role/permission matrix |
| `/report` | Report | Owner business report |
| `/cost-calculator/*` | CostCalculator | Recipe cost engine |
| `/content-studio/*` | ContentStudio2 | New content engine |
| `/content/studio` | Studio (legacy) | |
| `/content/brand/setup` + variants | BrandSetup | |
| `/content/brand/:id` | BrandDetail | |
| `/content/review` | ReviewQueue | |
| `/content/ideas` | IdeaBank | |
| `/inventory/procurement` | ProcurementOrders | Purchase orders |
| `/finance` | FinanceDashboard | All Finance tabs (incl. cash, bank) |
| `/marketing` | MarketingDashboard | All Marketing tabs |
| `/analytics-legacy` | BusinessAnalytics | Owner only |
| `/ideas/categories` | IdeasCategories | |
| `/pos/:branchId/tables` | TableQRGenerator | |

## Routes accessible to staff (any auth user)

| Route | Page | Staff-visible behavior |
|---|---|---|
| `/login`, `/staff/request-access` | public | n/a |
| `/` | RootRedirect | Redirects staff to `/my-tasks` |
| `/dashboard` | Dashboard | **Visible to staff.** May expose finance numbers; needs verification. ⚠ |
| `/my-tasks` | MyTasks | Personal task view |
| `/tasks/:id` | TaskDetail | Single task — note: list is owner-only but detail isn't |
| `/recipes`, `/recipes/:id` | Recipes / RecipeDetail | Visible — fine for training |
| `/expenses/*` | ExpensesPage | **NOT** owner-only — staff can see expenses ⚠ |
| `/products` | ProductCatalog | Visible — fine for product browsing, edit may be permission-gated inside |
| `/inventory` + sub | InventoryHub / StockManager / Suppliers / StockCheckAll | Mostly staff-visible — owner-only only on procurement |
| `/loyalty/*` (all) | Loyalty pages | Staff can stamp/redeem → operational |
| `/pos/*` | POS suite | Staff use it to take orders. Permission gates inside POS pages (`pos.end_of_day`, `pos.void_order`, etc.) |
| `/menu/:branchId`, `/checkout`, `/order-confirmation` | Storefront | Public |
| `/ideas` | IdeasBoard | Staff can post ideas |
| `/vestaboard` | Vestaboard | Staff visible |

## Inside-page permission checks (`usePermission`)

28 `usePermission` / `can()` call sites across modules. Common features gated:

| Feature key | Action | Used by |
|---|---|---|
| `pos.end_of_day` | view | `POSEndOfDay`, EOD button on Settings |
| `pos.void_order` | act | CartPanel void button, POSOrders void/refund |
| `pos.discount_any` | act | CartPanel discount cap |
| `analytics.financial` | view | Finance "financial" tab inside dashboard |
| `analytics.view` | view | All Finance tabs at top level |

Plus the audit-fixed `manager_override_enabled` / `per_barista_shift` / `require_pin` settings flags toggleable per branch via POSSettings.

## Risks flagged for follow-up

1. **`/dashboard` is staff-visible.** Today the dashboard surfaces task counts, low-stock items, founders-club number. **NEEDS_VERIFY:** does the Dashboard component show any LYD revenue/cost numbers to staff? If yes, gate it server-side.
2. **`/expenses/*` is not `OwnerRoute`-gated.** Anyone authenticated can navigate there. The Finance Expenses tab IS owner-only via the new RLS policy `expense_entries_owner_only`, so writes/reads of `expense_entries` will fail for staff at the DB level — but the page will render and show error toasts. **Recommend:** add `OwnerRoute` wrapper or hide via permission check.
3. **`/products` is staff-visible.** Catalog browse is fine, but the "Add Product" / "Edit cost" features should be permission-gated inside the page.
4. **`/inventory/stock`** / **`/inventory/suppliers`** — staff can see supplier contact + costs. **NEEDS_VERIFY** whether that's intentional.
5. **`/recipes/:id`** shows full ingredient lists with bulk costs. The brief-mentioned recipe-leak concern: a staff member copying photos of recipe pages could exfiltrate competitive info. **Mitigation:** server-side RLS on `ingredients` to hide `bulk_cost` / `cost_per_unit` from non-owners. Today RLS on `ingredients` is **NEEDS_VERIFY** — likely permissive.

## What I'd verify with a live staff login

If you can drop a staff email/password (or create a sandbox staff account), I'd run the same Chrome-MCP walkthrough as owner and:
- Confirm dashboard hides finance numbers.
- Try to navigate `/expenses` and confirm it renders an empty / "no permission" view.
- Try to navigate `/finance` and confirm the redirect to `/my-tasks` works.
- Try to navigate `/marketing` and confirm same.
- Try to `/recipes/:id` and inspect the page for owner-only fields.

Without a staff login, those five live checks are deferred. Static audit above stands.
