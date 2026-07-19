# Noch Apps Project Map and ERP Action Plan

Date: 2026-06-14  
Scope: Static investigation of `C:\Users\aeroh\AI apps\Noch_apps_June_2026` as a first-time reviewer. No code changes or destructive cleanup were performed.

## Executive Summary

Noch has grown from a cafe POS into a custom ERP-style operating system: POS, inventory, recipes/costing, loyalty, marketing, content studio, finance, accounting, staff/tasks, ops checklists, and public ordering. The product direction is strong, but the codebase now has two main risks:

1. Too many overlapping versions of the same business truth.
2. Too much business logic spread across large client files instead of module-specific services/RPCs.

The next phase should not be "add more features." It should be consolidation: define canonical modules, retire legacy tables/routes, stabilize finance/accounting reconciliation, and reduce the largest files into testable service boundaries.

## Project Map

### Applications

| Area | Path | Purpose | Notes |
|---|---|---|---|
| Staff/admin app | `apps/pos` | Main React/Vite SPA for POS, owner dashboard, internal tools, and some customer ordering routes | 247 JS/JSX/TS/TSX files |
| Customer storefront | `apps/storefront` | Public `noch.cloud` style storefront/hub | 8 source files; much smaller |
| Database/backend | `supabase` | 124 migrations plus 33 Edge Functions | Most business persistence lives here |
| Shared package | `packages/shared` | Reserved/shared scaffold | Mostly unused |
| Docs | `docs` | Prior audits, finance plans, page map | Useful but fragmented |
| Duplicate/backup tree | `Noch Cafe V2` | Full nested copy including `.git`, app tree, docs, deps | Untracked by root Git; ~21k files and ~485 MB observed before permission errors |

### Current Functional Modules

| Module | Main paths | Status |
|---|---|---|
| POS | `apps/pos/src/modules/pos` | Active and materially improved since earlier audit: atomic order RPC, refunds, voids, sessions, reports, modifiers, print queue |
| Finance | `apps/pos/src/modules/finance` | Active management dashboard; overlaps with legacy analytics and accounting |
| Accounting/GL | `apps/pos/src/modules/accounting`, `supabase/migrations/20260613*` | New double-entry backbone; auto-posting off by default |
| Inventory | `apps/pos/src/pages/inventory`, `InventoryHub`, `StockCheckAll`, POS stock check | Useful but split across product stock, ingredient stock, stock checks, procurement |
| Recipes/costing | `apps/pos/src/pages/Recipes*`, `apps/pos/src/modules/costCalculator` | Two representations: recipe cards and costed recipes |
| Loyalty | `apps/pos/src/modules/loyalty`, loyalty migrations/functions | Broad feature set: customers, stamps, QR, rewards, passport, feedback, challenges |
| Marketing | `apps/pos/src/modules/marketing` | Uses loyalty/customer data; overlaps with content studio |
| Content Studio | `apps/pos/src/modules/contentStudio` plus legacy `apps/pos/src/pages/content` | New and legacy systems both present |
| Staff/tasks/RBAC | `apps/pos/src/pages/Staff*`, `MyTasks`, `features.js`, `PermissionsContext` | Central navigation/feature map exists, but server policies are uneven |
| Ops checklist | `apps/pos/src/modules/ops` | New checklist/restock module gated by settings |
| Storefront/order | `apps/pos/src/pages/storefront`, `apps/storefront` | Customer-facing surfaces split across two apps |

## Key Findings

### 1. Source-of-truth duplication is the biggest ERP risk

The app has multiple parallel systems for similar business concepts:

| Business concept | Competing sources | Recommendation |
|---|---|---|
| Revenue | `pos_orders`, `pos_sales_daily`, old `sales_transactions`, old `business_metrics`, JS aggregations in legacy analytics | Canonical: `pos_orders` plus views/RPCs. Retire `sales_transactions` and `business_metrics` after export/archive. |
| Expenses | `expenses`, `expense_entries`, `operating_costs` | Canonicalize one expense workflow. Prefer the newer approval/receipt flow plus GL posting. |
| Finance/accounting | `/finance`, `/accounting`, `/analytics-legacy`, `operating_costs` tabs | Keep `/finance` for management KPIs, `/accounting` for ledger. Remove legacy analytics after parity checklist. |
| Recipes | JSONB ingredients on recipe cards vs `recipe_ingredients` join table for costing | Canonicalize to costed recipe/ingredient tables; make recipe cards read from that model or become training-only. |
| Products/inventory | `pos_products.stock_qty`, ingredient stock, stock check items, procurement orders | Define product stock vs ingredient stock explicitly; link menu products to recipes. |
| Content | `/content-studio/*` and old `/content/*` pages | Keep Content Studio 2.0; freeze and redirect old content routes. |

### 2. The codebase has large "god files"

Largest active files:

| File | Lines | Concern |
|---|---:|---|
| `apps/pos/src/lib/supabase.js` | ~2006 | Cross-module API kitchen sink |
| `apps/pos/src/modules/pos/pages/POSTerminal.jsx` | ~1314 | POS UI, state, offline, payment, customer, modifiers, printing |
| `apps/pos/src/pages/expenses/ExpensesPage.jsx` | ~1143 | Multiple expense screens and services together |
| `apps/pos/src/pages/content/BrandDetail.jsx` | ~1130 | Legacy content surface |
| `apps/pos/src/pages/content/ResearchHub.jsx` | ~1118 | Legacy content surface |
| `apps/pos/src/modules/pos/pages/POSProducts.jsx` | ~1057 | Product/category CRUD and image workflows |

Recommended direction: split by module service files first, then UI components. Do not do a cosmetic refactor. Refactor only where it helps remove duplication or add tests.

### 3. Legacy code is still reachable

Confirmed legacy routes and labels:

- `/analytics-legacy`
- Finance tab `Overview (legacy)`
- `/content/*` legacy pages
- `features.js` entries for `analytics` and `content` as legacy permissions
- `BusinessAnalytics` and old analytics tabs still read/write `operating_costs`, `sales_transactions`, and `business_lines`

These should be marked "read-only until sunset" or removed behind a feature flag.

### 4. Security/RLS improved in newer modules, but older open policies remain

The newer GL and finance/accountant migrations are more intentional. Older migrations still include many `using (true) with check (true)` policies, especially early POS, loyalty, content, modifiers, and some suggested action tables.

Action: perform a live RLS policy audit by table. Do not rely only on client-side route guards. ERP-grade systems treat role-based access, auditability, and data segregation as foundational.

### 5. Finance/accounting is promising but needs reconciliation discipline

The GL module now has:

- Chart of accounts
- Journal batches/lines
- Trial balance
- Income statement/balance sheet views
- Sales day posting
- Expense posting
- Opening balances
- Account mapping

This is the right direction. The gap is operational trust: the system needs a daily reconciliation report proving POS totals, finance P&L, and GL postings agree.

### 6. Documentation is useful but not authoritative

`docs/PAGES.md` is strong, but `README.md` is still default Vite text. Existing audits and implementation notes are scattered. The root README should become the source-of-truth landing page for architecture, local dev, deployment, environments, and module ownership.

### 7. Test coverage is too thin for an ERP

Current `apps/pos/package.json` has no `test` script, only `lint`, `build`, and `preview`. Playwright tests exist for owner/staff audit paths, but there are no unit tests for money math, posting, permission decisions, recipe costing, offline sync, refund/void invariants, or GL balancing.

ERP best practice treats testing as continuous, not an end-of-project activity. Microsoft Dynamics guidance explicitly frames testing as part of the application lifecycle, with scope, cycles, objectives, criteria, tracking, and test-case maintenance.

## Benchmark Against ERP / Restaurant Systems

### What Noch already does well

- Cafe-specific POS rather than generic CRUD.
- Strong POS operational features: refunds, voids, payment switching, sessions, modifiers, reporting, stock flags.
- Loyalty/customer memory is much richer than typical small cafe systems.
- GL/accounting direction is better than simple dashboard-only systems.
- Bilingual and local operational assumptions are built in.

### Where mature ERP/POS systems are stronger

| Best-practice area | Benchmark signal | Noch gap |
|---|---|---|
| Implementation lifecycle | Dynamics 365 uses staged implementation: strategize, initiate, implement, prepare, operate | Noch has feature accumulation but no visible retirement/governance stage |
| Security | Dynamics emphasizes security, privacy, compliance, authorization, auditing, and monitoring as shared responsibilities | Mixed RLS maturity; some older open policies remain |
| Restaurant POS workflow | Odoo restaurant POS includes table/floor management, kitchen/bar communication, order transfer/merge, bill splitting, preparation printers | Noch has QR tables and POS, but table/kitchen workflow is not as complete |
| Inventory/accounting integration | Odoo treats inventory valuation as part of inventory/accounting operations | Noch has stock/costing/GL pieces, but product-to-recipe-to-inventory valuation is not yet unified |
| Test strategy | Dynamics guidance calls for continuous, scoped, tracked testing | Noch has limited E2E and no focused accounting/POS unit tests |

Sources:

- Microsoft Dynamics 365 implementation guide: https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/overview
- Microsoft Dynamics 365 security guidance: https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security
- Microsoft Dynamics 365 testing strategy: https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/testing-strategy
- Odoo restaurant POS features: https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/restaurant.html
- Odoo inventory valuation documentation: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation.html

## Recommended Action Plan

### Phase 0: Freeze and decide source of truth, 1-2 days

1. Declare canonical sources:
   - Revenue: `pos_orders` and derived views/RPCs.
   - Expenses: one chosen expense table/workflow.
   - Accounting: `gl_*`.
   - Menu costing: `pos_products -> recipes -> recipe_ingredients -> ingredients`.
   - Customers: `loyalty_customers`.
2. Add a `docs/ARCHITECTURE.md` and replace the default root `README.md`.
3. Mark legacy routes visibly in docs and navigation.
4. Decide whether `Noch Cafe V2/` is a backup, fork, or accidental nested copy. If backup, move it outside the repo or archive it.

### Phase 1: Money truth and reconciliation, 3-5 days

1. Build a reconciliation report:
   - POS completed sales by day/branch.
   - Finance P&L numbers.
   - GL posted batches.
   - Differences highlighted.
2. Turn GL auto-posting on only after reconciliation passes for a historical sample.
3. Retire or read-only old `operating_costs`, `sales_transactions`, `sales_uploads`, and `business_metrics` flows.
4. Add tests for:
   - `create_pos_order`
   - void/refund/payment switch
   - `gl_post_sales_day`
   - `gl_sync_period`
   - finance P&L vs GL agreement

### Phase 2: Retire legacy surfaces, 3-7 days

1. Replace `/analytics-legacy` with redirects or archive behind owner-only debug access.
2. Freeze old `/content/*` pages and redirect to `/content-studio/*` after feature parity.
3. Remove `content` and `analytics` legacy permission keys after routes are gone.
4. Move old analytics Edge Function/table usage to archive scripts.

### Phase 3: Product, recipe, and inventory consolidation, 1-2 weeks

1. Add/enforce `pos_products.recipe_id` or an explicit product-recipe mapping table.
2. Make menu profitability and GL COGS use that mapping.
3. Decide whether product stock is sellable-item stock, ingredient stock, or both.
4. Merge stock checks, ingredient stock, procurement, and alerts into one inventory model.
5. Add cycle count/reorder rules before adding more inventory intelligence.

### Phase 4: Module-service refactor, 1-2 weeks

1. Split `apps/pos/src/lib/supabase.js` into module-owned API files:
   - `tasks-supabase.js`
   - `recipes-supabase.js`
   - `inventory-supabase.js`
   - `loyalty-supabase.js`
   - `content-legacy-supabase.js`
2. Reduce `POSTerminal.jsx` by extracting:
   - cart state
   - payment orchestration
   - customer/loyalty selection
   - offline sync state
   - receipt/printing orchestration
3. Reduce `ExpensesPage.jsx` into nested pages/components.
4. Keep refactors behavior-preserving and backed by tests.

### Phase 5: Security and role hardening, 1 week

1. Produce a table-by-table RLS matrix.
2. Replace open authenticated policies with:
   - owner/accountant finance access
   - staff branch-scoped POS access
   - customer-safe public storefront access
   - service-role-only automation writes
3. Verify every sensitive write has an audit trail.
4. Add permission regression tests.

### Phase 6: ERP maturity features, after consolidation

Only after the above:

1. Kitchen/preparation display or print routing.
2. Table transfer/merge and bill splitting if dine-in becomes important.
3. Bank reconciliation workflow.
4. Supplier invoice/OCR workflow.
5. Inventory valuation and opening balances by branch.
6. Payroll and salary posting.
7. Forecasting based on actual GL data, not parallel finance tables.

## Modules Likely Surplus or Candidates for Redundancy

| Candidate | Keep? | Action |
|---|---|---|
| `Noch Cafe V2/` nested copy | No, not inside active repo | Move/archive after confirming it is not the deployment source |
| `/analytics-legacy` and old analytics tabs | Temporary only | Sunset after Finance parity |
| `sales_uploads`, `sales_transactions`, `business_metrics` | Probably no | Archive unless Bloom import still depends on them |
| `operating_costs` | Probably no | Migrate data into canonical expenses/GL |
| Old `/content/*` pages | Temporary only | Redirect to `/content-studio/*` |
| Default root README | No | Replace |
| `packages/shared` scaffold | Not yet useful | Either use for shared types/utils or remove from active mental model |

## Immediate Next Actions

1. Confirm what `Noch Cafe V2/` is.
2. Choose the canonical expense workflow.
3. Build the reconciliation report before enabling GL auto-posting.
4. Freeze legacy analytics/content surfaces.
5. Replace root README with an architecture-first README.
6. Add test scripts and money/accounting regression tests.

## Email/ChatGPT Copy

Subject: Noch Apps ERP Audit and Consolidation Plan - 2026-06-14

I reviewed the Noch Apps project as a first-time auditor. It has evolved from a cafe POS into a broader ERP-style operating system covering POS, inventory, recipes/costing, loyalty, marketing, content studio, finance, accounting, staff/tasks, ops checklists, and public ordering.

The strongest recommendation is to pause new feature work briefly and consolidate. The biggest risk is not lack of features; it is overlapping sources of truth. Revenue, expenses, analytics, recipes, inventory, content, and finance/accounting each have legacy and newer implementations living side by side.

Priority plan:

1. Declare canonical sources of truth: `pos_orders` for revenue, one expense workflow, `gl_*` for accounting, product-to-recipe-to-ingredient mapping for COGS, and `loyalty_customers` for customer data.
2. Build a reconciliation report proving POS, Finance, and GL agree by day and branch.
3. Freeze and retire legacy analytics/content routes after parity.
4. Consolidate product, recipe, ingredient, inventory, and procurement into one model.
5. Split the largest files into module-owned service layers and testable components.
6. Harden RLS/permissions table-by-table.
7. Add focused tests for money, POS, refunds/voids, GL posting, and permissions.

The app has excellent product ambition and several mature pieces already, especially POS and the new GL backbone. The next win is discipline: fewer parallel systems, clearer ownership, and stronger reconciliation.

