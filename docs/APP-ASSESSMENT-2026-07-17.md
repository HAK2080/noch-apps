# Noch Apps — Application Map and Assessment

**Assessment date:** 2026-07-17  
**Evidence:** current routes and source, Supabase migrations, audit notes, latest commit `f41acc7`, and current worktree. Static assessment; live Supabase/RLS behavior was not executed.

## System Map

### Applications and entry points

- `apps/pos` is the authenticated internal SPA and also hosts public customer menu, checkout, feedback, and order confirmation routes.
- `apps/storefront` is the public landing/shop/loyalty surface.
- `supabase` is the shared database and automation layer: migrations, RPCs, RLS, and 40+ Edge Functions.
- `scripts` handles migrations, seeding, deployment, and Bloomly synchronization.

### Main workflows

1. **Authentication and access:** Supabase Auth loads `profiles`; owners, staff, accountants, supervisors, limited staff, and data-entry users are routed differently. `features.js` and `role_permissions` drive navigation and feature access; `OwnerRoute` remains a coarse client-side gate.
2. **Owner operations:** `/dashboard` combines tasks, alerts, access requests, suggested actions, and basic signals. `/staff`, `/staff/roles`, `/report`, and `/messages` handle people, permissions, reports, and communication.
3. **POS:** branch selection → PIN screen → terminal → cart/payment → order, inventory, shift, receipt, and optional offline sync side effects. End-of-day closes shifts, records cash movements, and captures counted cash.
4. **Customer commerce:** public branch menu → cart → checkout → confirmation; feedback and loyalty connect back to the same database.
5. **Management finance:** `/finance` contains executive summary, P&L, menu profitability, cash/runway, expenses, shifts, bank import, cost mapping, variance, CapEx, forecast, and legacy/AI views. `/accounting` is the double-entry GL.
6. **Growth and retention:** loyalty, marketing, content studio, ideas, experiments, and Vestaboard manage customer engagement and content operations.
7. **Background work:** Supabase Functions and cron jobs process sales, reminders, loyalty notifications, WhatsApp/Telegram, marketing segments, content evaluation, and GL synchronization.

## Assessment

### P0 — fix before trusting the system with more branches

- **Server-side authorization is not trustworthy.** The original POS migration uses broad authenticated `using (true) with check (true)` policies. Branch assignment is not a first-class user-to-branch relationship, and sensitive POS writes can be called directly. Client route guards cannot enforce security.
- **The order ledger is not transactional.** Order creation performs multiple writes; retries can duplicate sales; order numbers are client-counted; stock and shift totals use read-modify-write. This can corrupt revenue, inventory, and cash.
- **Cash close is not a controlled accounting event.** Sales can arrive between printing and closing, and the close path lacks a strong reconciliation against orders, movements, and counted cash.

### P1 — fix before calling finance “business health”

- **Two expense systems remain:** `expenses` and `expense_entries`. Finance/GL reporting can combine them while users enter and approve them through different workflows.
- **Finance is still cash-basis and partially manual:** COGS depends on `pos_products.cost_lyd`; bank balances depend on imported statement balances; physical cash is a global manual snapshot; obligations and AR/AP are absent.
- **Business-day definitions are inconsistent.** The new `pos_sales_daily` view uses a 5 AM–5 AM Africa/Tripoli trading day, while `finance_pnl` and GL posting still use calendar timestamp boundaries. POS, finance, and GL can disagree around midnight.
- **Branch profitability is not fully attributable.** Unassigned/corporate expenses are included by branch in the current P&L predicate unless an allocation policy is introduced.
- **The owner dashboard lacks comparisons, drill-down, reconciliation status, and historical liquidity snapshots.** The current executive summary is useful as a first view but must label data freshness and limitations.

### P2 — reduce maintenance cost

- Legacy `/analytics-legacy`, old content routes, old analytics tables, and duplicated recipe/cost representations remain reachable.
- Large client files still mix UI, orchestration, persistence, and business rules, especially POS, inventory, analytics, and content surfaces.
- Tests are mainly Playwright audit paths. There are no focused unit/integration tests for money math, transaction idempotency, RLS, branch scoping, GL balancing, or reconciliation.
- The root README is still the Vite template; `docs/PAGES.md` is useful but dated and should be generated or maintained from the route registry.

## Recommended Sequence

1. Add `staff_branches` and server-side authorization/RLS; replace direct sensitive writes with transaction RPCs.
2. Make order creation idempotent and atomic; add unique order identity, shift-close locking, and reconciliation reports.
3. Choose one expense source, align business-day windows across POS/Finance/GL, and add corporate allocation.
4. Build the owner summary around profitability, liquidity/obligations, branch exceptions, comparisons, and data trust.
5. Add focused money/security/GL tests, then retire legacy analytics and content surfaces.

## Verification Status

- POS production build: passed.
- Targeted lint for the finance summary: passed.
- Full repository lint: currently fails on many pre-existing errors.
- Playwright E2E: not run against a configured live environment.
- Supabase migration application, RLS behavior, and production data reconciliation: not verified in this static pass.
