# Noch — Pages Inventory

**Updated:** 2026-05-07. **Source of truth:** `src/App.jsx`. If you add a route, update this file.

This file maps every page in this repo to its file, URL, audience, and access gate. When you ask me about "the website" or "a page," check this first.

---

## TL;DR — what lives where

Repo layout (as of 2026-05-07):

```
Noch_apps_May_2026/
├── apps/
│   ├── pos/           ← apps.noch.cloud (POS + dashboard SPA)
│   └── storefront/    ← noch.cloud (Hub + Menu + Shop + Loyalty landing)
├── packages/
│   └── shared/        ← reserved for shared assets/utils (currently scaffold)
├── deploy.py          ← deploys both, --target apps|storefront|both
├── supabase/          ← migrations (one DB, both apps use it)
├── docs/              ← this file + audit/, accounting/
└── .env               ← single source of truth; both apps read it
```

| Domain | Code lives in | Audience | Auth |
|---|---|---|---|
| **`apps.noch.cloud`** | `apps/pos/` | Staff (POS, dashboard) + Customers (menu/checkout pages) | Mixed |
| **`noch.cloud`** | `apps/storefront/` | Customers (landing page, marketing) | Public |

The previously-separate `C:/Users/aeroh/AI apps/noch-storefront/` folder was merged in here on 2026-05-07.

Build + deploy:

```
python deploy.py apps         # builds + deploys apps.noch.cloud
python deploy.py storefront   # builds + deploys noch.cloud
python deploy.py both         # both, in order
```

Both `apps/pos/vite.config.js` and `apps/storefront/vite.config.js` declare `envDir: '../..'` — they both read the **single `.env` at the repo root**. Don't duplicate the env file; if a build ever fails with "supabaseUrl is required," check the root `.env` exists and is readable.

The 4 mockup HTMLs at the repo root (`noch-storefront-mockup.html`, `noch-storefront-refined.html`, `noch-menu.html`, `noch-hub.html`) were design experiments — **deleted in commit `e89fe75`**. They were never deployed.

---

## All routes (apps.noch.cloud)

Every entry below is reached at `https://apps.noch.cloud<route>`.

Legend: 🟢 public · 🔒 logged-in any role · 👑 owner only

### Public (no login)

| Route | Page file | Purpose |
|---|---|---|
| 🟢 `/login` | `src/pages/Login.jsx` | Email/password sign-in |
| 🟢 `/staff/request-access` | `src/pages/StaffAccessRequest.jsx` | Self-serve staff sign-up request |
| 🟢 `/menu/:branchId` | `src/pages/storefront/Menu.jsx` | **Customer storefront menu** — bilingual (EN/AR), GPS gate, coupon, cart |
| 🟢 `/checkout/:branchId` | `src/pages/storefront/Checkout.jsx` | Customer checkout flow |
| 🟢 `/order-confirmation` | `src/pages/storefront/OrderConfirmation.jsx` | Post-order confirmation w/ pickup code |

### Internal app — root

| Route | Page file | Purpose |
|---|---|---|
| 🔒 `/` | `RootRedirect` (in `App.jsx`) | Redirects to `/dashboard` for owners, `/my-tasks` for staff |
| 🔒 `/dashboard` | `src/pages/Dashboard.jsx` | Main app home for owners |
| 🔒 `/my-tasks` | `src/pages/MyTasks.jsx` | Staff personal task view |

### Tasks

| Route | Page file | Purpose |
|---|---|---|
| 👑 `/tasks` | `src/pages/Tasks.jsx` | All tasks board |
| 🔒 `/tasks/:id` | `src/pages/TaskDetail.jsx` | Single task view |

### Staff

| Route | Page file | Purpose |
|---|---|---|
| 👑 `/staff` | `src/pages/Staff.jsx` | Staff list + management |
| 👑 `/staff/roles` | `src/pages/staff/RoleManager.jsx` | Role/permission matrix |
| 👑 `/report` | `src/pages/Report.jsx` | Owner business report |

### Recipes & costing

| Route | Page file | Purpose |
|---|---|---|
| 🔒 `/recipes` | `src/pages/Recipes.jsx` | Recipe list |
| 🔒 `/recipes/:id` | `src/pages/RecipeDetail.jsx` | Single recipe |
| 👑 `/cost-calculator/*` | `src/pages/CostCalculator.jsx` | Recipe cost calculator (nested routes) |
| 🔒 `/expenses/*` | `src/pages/expenses/ExpensesPage.jsx` | Expenses module (nested routes) |

### Content Studio

| Route | Page file | Purpose |
|---|---|---|
| 👑 `/content` | `src/modules/contentStudio` (default) | Content studio v2 home |
| 👑 `/content-studio/*` | `src/modules/contentStudio` | Content studio v2 (nested routes) |
| 👑 `/content/studio` | `src/pages/content/Studio.jsx` | Content studio v1 (legacy) |
| 👑 `/content/brand/setup` | `src/pages/content/BrandSetup.jsx` | Brand wizard |
| 👑 `/content/brands/new` | `src/pages/content/BrandSetup.jsx` | New brand |
| 👑 `/content/brand/:id` | `src/pages/content/BrandDetail.jsx` | Brand detail |
| 👑 `/content/review` | `src/pages/content/ReviewQueue.jsx` | Review queue |
| 🔒 `/content/ideas` | `src/pages/content/IdeaBank.jsx` | Idea bank (legacy — use `/ideas`) |
| `/content/create`, `/content/research`, `/content/calendar`, `/content/experiments` | redirects | Legacy redirects |

### Products / Inventory

| Route | Page file | Purpose |
|---|---|---|
| 🔒 `/products` | `src/pages/ProductCatalog.jsx` | Cross-branch product catalog |
| 🔒 `/inventory` | `src/pages/InventoryHub.jsx` | Inventory entry point |
| 🔒 `/inventory/stock-check` | `src/pages/StockCheckAll.jsx` | Cross-branch stock check |
| 🔒 `/inventory/stock` | `src/pages/inventory/StockManager.jsx` | Stock manager |
| 👑 `/inventory/procurement` | `src/pages/inventory/ProcurementOrders.jsx` | Purchase orders |
| 🔒 `/inventory/suppliers` | `src/pages/inventory/Suppliers.jsx` | Supplier directory |

### Analytics

| Route | Page file | Purpose |
|---|---|---|
| 👑 `/analytics` | `src/pages/BusinessAnalytics.jsx` (uses `pages/analytics/*`) | Business analytics dashboard with tabs (Overview, Branch, Bloom, Category, Financial, Intelligence, Business Lines) |

### Loyalty (Nochi)

| Route | Page file | Purpose |
|---|---|---|
| 🔒 `/loyalty` | `LoyaltyDashboard` | Loyalty home |
| 🔒 `/loyalty/customers` | `LoyaltyCustomers` | Customer list |
| 🔒 `/loyalty/customers/:id` | `CustomerDetail` | Single customer |
| 🔒 `/loyalty/rewards` | `LoyaltyRewards` | Reward catalog |
| 🔒 `/loyalty/qr` | `LoyaltyQR` | QR code generator |
| 🔒 `/loyalty/settings` | `LoyaltySettings` | Loyalty config |
| 🔒 `/loyalty/leaderboard` | `LoyaltyLeaderboard` | Top customers |
| 🔒 `/loyalty/stamp` | `LoyaltyStamp` | Manual stamp UI |
| 🔒 `/loyalty/gestures` | `LoyaltyGestures` | Gesture-based actions |
| 🔒 `/loyalty/spin` | `LoyaltySpinWheel` | Spin-wheel reward |

> Loyalty page files live under the loyalty module (not in `src/pages/`). When in doubt, grep for the component name.

### Ideas

| Route | Page file | Purpose |
|---|---|---|
| 🔒 `/ideas` | `src/pages/ideas/IdeasBoard.jsx` | Ideas Kanban |
| 👑 `/ideas/categories` | `src/pages/ideas/IdeasCategories.jsx` | Idea categories admin |

### Vestaboard

| Route | Page file | Purpose |
|---|---|---|
| 🔒 `/vestaboard` | `src/pages/Vestaboard.jsx` | Vestaboard message editor |

### POS (point of sale)

All POS page files live in `src/modules/pos/pages/`. See [`docs/audit/01-repo-map.md`](docs/audit/01-repo-map.md) for an in-depth map.

| Route | Page file | Purpose |
|---|---|---|
| 🔒 `/pos` | `POSHome.jsx` | Branch picker |
| 🔒 `/pos/:branchId` | `POSTerminal.jsx` | The register itself (PIN-gated) |
| 🔒 `/pos/:branchId/end-of-day` | `POSEndOfDay.jsx` | Z-report + cash count + cash movements |
| 🔒 `/pos/:branchId/inventory` | `POSInventory.jsx` | Per-branch stock |
| 🔒 `/pos/:branchId/settings` | `POSSettings.jsx` | Printer + branch + feature flags |
| 🔒 `/pos/:branchId/products` | `POSProducts.jsx` | Product CRUD |
| 🔒 `/pos/:branchId/stock-check` | `POSStockCheck.jsx` | Weekly stock check |
| 🔒 `/pos/:branchId/orders` | `POSOrders.jsx` | Today's/range orders + reprint + refund + Presto-collected |
| 🔒 `/pos/:branchId/reports` | `POSReports.jsx` | Sales reports (today/week/month, by-product, by-barista) |
| 🔒 `/pos/:branchId/modifiers` | `POSModifiers.jsx` | Modifier groups + options + product assignment |
| 👑 `/pos/:branchId/tables` | `src/pages/TableQRGenerator.jsx` | Table QR generator |

PIN entry component: `POSPinLogin.jsx` (not a route — rendered inline by terminal/home).

### Catch-all

| Route | Behaviour |
|---|---|
| `*` | Redirect to `/` |

---

## Route guards

Defined in `src/App.jsx`:

| Component | Behaviour |
|---|---|
| `ProtectedRoute` | Redirects to `/login` if not signed in |
| `OwnerRoute` | Redirects to `/my-tasks` if `profile.role !== 'owner'` |
| `RootRedirect` | At `/` — redirects owners to `/dashboard`, others to `/my-tasks` |

Note: the **canonical permission system** is `usePermission` + `PermissionsContext`, backed by the `role_permissions` table. `OwnerRoute` is a coarse gate; finer-grained checks happen inside the page (e.g. `can('pos', 'end_of_day')` in `POSEndOfDay`).

---

## Where the customer storefront actually lives

This is the most asked question. Three surfaces are sometimes called "the storefront":

1. **`noch.cloud` landing** — orange tile grid with the rabbit mascot. **NOT in this repo.** Hosted separately (different deploy). Edit at its own source.
2. **`apps.noch.cloud/menu/:branchId`** — the React menu page in this repo at `src/pages/storefront/Menu.jsx`. Has its own header (back-arrow + Noch logo + EN/AR toggle). This is what customers actually order from.
3. **`apps.noch.cloud/checkout/:branchId`** + **`/order-confirmation`** — the rest of the customer purchase flow.

Customer flow today:
```
noch.cloud  →  taps "المنيو"  →  picks branch  →  apps.noch.cloud/menu/<branch-uuid>
            →  cart  →  /checkout/<branch-uuid>  →  /order-confirmation
```

---

## Files that are NOT pages

For completeness, things that look like pages but are not routes:

- **POS components** under `src/modules/pos/components/` (BarcodeScanner, CartPanel, ManagerOverrideModal, PaymentModal, ProductGrid, ProductModifierModal, QRScanner, ReceiptModal, ShiftAttendees) — UI building blocks, rendered by the page above them.
- **`src/components/Layout.jsx`** — shared frame (sidebar + topbar) used by most internal pages.
- **`src/components/AppNav.jsx`, `Sidebar.jsx`, `Topbar.jsx`** — navigation chrome.
- **Ideas / Loyalty / Content sub-components** — same pattern, components inside page modules.

---

## How to add a new page

1. Create the page file under `src/pages/<group>/<Name>.jsx` (or `src/modules/<x>/pages/<Name>.jsx` if it belongs to a module).
2. Import + add a `<Route>` in `src/App.jsx`. Wrap with `ProtectedRoute` (and `OwnerRoute` if owner-only).
3. **Update this file (`docs/PAGES.md`).**
4. If the page introduces a new permission feature, add it to `role_permissions` via a migration.

If you skip step 3, this doc decays and we end up hunting again.
