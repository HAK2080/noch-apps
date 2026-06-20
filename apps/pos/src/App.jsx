import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useLanguage } from './contexts/LanguageContext'
import { usePermissions } from './contexts/PermissionsContext'

// Eagerly-loaded: critical-path screens that the operator hits within
// 1 second of opening the app every day. Login + Dashboard + POS +
// MyTasks. Everything else is code-split via React.lazy below to keep
// the initial bundle small for slow Tripoli connections.
import Login from './pages/Login'
import StaffAccessRequest from './pages/StaffAccessRequest'
import Dashboard from './pages/Dashboard'
import MyTasks from './pages/MyTasks'

// POS — eager. Daily critical path; baristas tap this instantly.
import POSHome from './modules/pos/pages/POSHome'
import POSTerminal from './modules/pos/pages/POSTerminal'
import { enableKioskMode } from './modules/pos/lib/pos-kiosk'

// Storefront (Public, customer-facing) — eager so the menu loads fast
// for customers on the worst connections.
import Menu from './pages/storefront/Menu'
import Checkout from './pages/storefront/Checkout'
import OrderConfirmation from './pages/storefront/OrderConfirmation'
import Feedback from './pages/storefront/Feedback'

// ── Code-split route components ──────────────────────────────────────
// Each import() becomes its own JS chunk Vite emits separately, fetched
// on first navigation to that route. Subsequent visits are cached.
const Tasks            = lazy(() => import('./pages/Tasks'))
const TaskDetail       = lazy(() => import('./pages/TaskDetail'))
const Staff            = lazy(() => import('./pages/Staff'))
const MyProfile        = lazy(() => import('./pages/staff/MyProfile'))
const RoleManager      = lazy(() => import('./pages/staff/RoleManager'))
const Report           = lazy(() => import('./pages/Report'))
const Recipes          = lazy(() => import('./pages/Recipes'))
const RecipeDetail     = lazy(() => import('./pages/RecipeDetail'))
const CostCalculator   = lazy(() => import('./pages/CostCalculator'))

const ContentStudio2   = lazy(() => import('./modules/contentStudio'))

const ProductCatalog   = lazy(() => import('./pages/ProductCatalog'))
const InventoryHub     = lazy(() => import('./pages/InventoryHub'))
const StockManager     = lazy(() => import('./pages/inventory/StockManager'))
const ProcurementOrders= lazy(() => import('./pages/inventory/ProcurementOrders'))
const Suppliers        = lazy(() => import('./pages/inventory/Suppliers'))
const StockCheckAll    = lazy(() => import('./pages/StockCheckAll'))
const FinanceDashboard = lazy(() => import('./modules/finance/FinanceDashboard'))
const MarketingDashboard = lazy(() => import('./modules/marketing/MarketingDashboard'))

const POSEndOfDay      = lazy(() => import('./modules/pos/pages/POSEndOfDay'))
const POSInventory     = lazy(() => import('./modules/pos/pages/POSInventory'))
const POSSettings      = lazy(() => import('./modules/pos/pages/POSSettings'))
const POSProducts      = lazy(() => import('./modules/pos/pages/POSProducts'))
const POSStockCheck    = lazy(() => import('./modules/pos/pages/POSStockCheck'))
const POSOrders        = lazy(() => import('./modules/pos/pages/POSOrders'))
const POSSessions      = lazy(() => import('./modules/pos/pages/POSSessions'))
const Sales            = lazy(() => import('./pages/Sales'))
const POSReports       = lazy(() => import('./modules/pos/pages/POSReports'))
const POSModifiers     = lazy(() => import('./modules/pos/pages/POSModifiers'))
const TableQRGenerator = lazy(() => import('./pages/TableQRGenerator'))

const IdeasBoard       = lazy(() => import('./pages/ideas/IdeasBoard'))
const IdeasCategories  = lazy(() => import('./pages/ideas/IdeasCategories'))
const Vestaboard       = lazy(() => import('./pages/Vestaboard'))

const AccountingDashboard = lazy(() => import('./modules/accounting/AccountingDashboard'))

const OpsChecklist     = lazy(() => import('./modules/ops/pages/OpsChecklist'))
const OpsSettings      = lazy(() => import('./modules/ops/pages/OpsSettings'))
const OpsDashboard     = lazy(() => import('./modules/ops/pages/OpsDashboard'))

const LoyaltyDashboard = lazy(() => import('./modules/loyalty/pages/LoyaltyDashboard'))
const LoyaltyCustomers = lazy(() => import('./modules/loyalty/pages/LoyaltyCustomers'))
const CustomerDetail   = lazy(() => import('./modules/loyalty/pages/CustomerDetail'))
const LoyaltyRewards   = lazy(() => import('./modules/loyalty/pages/LoyaltyRewards'))
const LoyaltyQR        = lazy(() => import('./modules/loyalty/pages/LoyaltyQR'))
const LoyaltySettings  = lazy(() => import('./modules/loyalty/pages/LoyaltySettings'))
const LoyaltyLeaderboard = lazy(() => import('./modules/loyalty/pages/LoyaltyLeaderboard'))
const LoyaltyStamp     = lazy(() => import('./modules/loyalty/pages/LoyaltyStamp'))
const LoyaltyGestures  = lazy(() => import('./modules/loyalty/pages/LoyaltyGestures'))
const LoyaltySpinWheel = lazy(() => import('./modules/loyalty/pages/LoyaltySpinWheel'))
const LoyaltyFeedback  = lazy(() => import('./modules/loyalty/pages/LoyaltyFeedback'))

const ExpensesPage     = lazy(() => import('./pages/expenses/ExpensesPage'))

// Experience OS — Phase 1-10
const InventoryIntelligence = lazy(() => import('./pages/inventory/InventoryIntelligence'))
const LoyaltyIntelligence   = lazy(() => import('./modules/loyalty/pages/LoyaltyIntelligence'))
const Experiments           = lazy(() => import('./pages/Experiments'))
const ExperimentDetail      = lazy(() => import('./pages/ExperimentDetail'))
const Messages              = lazy(() => import('./pages/Messages'))

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  if (loading) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center">
      <p className="text-noch-muted">{t('loading')}</p>
    </div>
  )
  if (!user) {
    // Preserve where the user was heading (e.g. /kiosk) so login can return them.
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}

function KioskEntry() {
  // Flip kiosk mode on for this tab so POSHome and POSTerminal render
  // chromeless. Then render POSHome (the branch picker).
  enableKioskMode()
  return <POSHome />
}

function LegacyContentBusinessRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/content-studio/businesses/${id}` : '/content-studio/businesses'} replace />
}

function OwnerRoute({ children }) {
  const { isOwner, loading } = useAuth()
  const { t } = useLanguage()
  if (loading) return null
  if (!isOwner) return <Navigate to="/my-tasks" replace />
  return children
}

// PermissionRoute — gate by role_permissions feature key (Manage Roles).
// Owner always passes (PermissionsContext short-circuits).
function PermissionRoute({ feature, children }) {
  const { hasAccess, loading, isOwner } = usePermissions()
  if (loading) return null
  if (isOwner || hasAccess(feature)) return children
  return <Navigate to="/my-tasks" replace />
}

function RootRedirect() {
  const { profile, loading, user } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!profile) return null
  if (profile.role === 'owner') return <Navigate to="/dashboard" replace />
  if (profile.role === 'data_entry') return <Navigate to="/expenses" replace />
  return <Navigate to="/pos" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={
        <div className="min-h-screen bg-noch-dark flex items-center justify-center">
          <div className="text-noch-muted text-sm">Loading…</div>
        </div>
      }>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/staff/request-access" element={<StaffAccessRequest />} />

        <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />

        <Route path="/tasks" element={
          <ProtectedRoute><OwnerRoute><Tasks /></OwnerRoute></ProtectedRoute>
        } />

        <Route path="/tasks/:id" element={
          <ProtectedRoute><TaskDetail /></ProtectedRoute>
        } />

        <Route path="/staff" element={
          <ProtectedRoute><OwnerRoute><Staff /></OwnerRoute></ProtectedRoute>
        } />

        <Route path="/staff/my-profile" element={
          <ProtectedRoute><MyProfile /></ProtectedRoute>
        } />

        <Route path="/staff/roles" element={
          <ProtectedRoute><OwnerRoute><RoleManager /></OwnerRoute></ProtectedRoute>
        } />

        <Route path="/report" element={
          <ProtectedRoute><PermissionRoute feature="reports"><Report /></PermissionRoute></ProtectedRoute>
        } />

        <Route path="/my-tasks" element={
          <ProtectedRoute><MyTasks /></ProtectedRoute>
        } />

        <Route path="/recipes/:id" element={
          <ProtectedRoute><RecipeDetail /></ProtectedRoute>
        } />

        <Route path="/recipes" element={
          <ProtectedRoute><Recipes /></ProtectedRoute>
        } />

        <Route path="/cost-calculator/*" element={
          <ProtectedRoute><OwnerRoute><CostCalculator /></OwnerRoute></ProtectedRoute>
        } />

        <Route path="/expenses/*" element={
          <ProtectedRoute><PermissionRoute feature="expenses"><ExpensesPage /></PermissionRoute></ProtectedRoute>
        } />

        {/* Content Studio 2.0 (Noch 4.0) */}
        <Route path="/content-studio/*" element={
          <ProtectedRoute><OwnerRoute><ContentStudio2 /></OwnerRoute></ProtectedRoute>
        } />

        {/* Content Studio (legacy) */}
        <Route path="/content" element={<Navigate to="/content-studio" replace />} />
        <Route path="/content/studio" element={<Navigate to="/content-studio" replace />} />
        <Route path="/content/brand/setup" element={<Navigate to="/content-studio/businesses/new" replace />} />
        <Route path="/content/brands/new" element={<Navigate to="/content-studio/businesses/new" replace />} />
        <Route path="/content/brand/:id" element={<LegacyContentBusinessRedirect />} />
        <Route path="/content/review" element={<Navigate to="/content-studio/drafts" replace />} />
        <Route path="/content/ideas" element={<Navigate to="/content-studio/concepts" replace />} />
        {/* Legacy routes — redirect to new studio */}
        <Route path="/content/create" element={<Navigate to="/content-studio" replace />} />
        <Route path="/content/research" element={<Navigate to="/content-studio/inspiration" replace />} />
        <Route path="/content/calendar" element={<Navigate to="/content-studio/campaigns" replace />} />
        <Route path="/content/experiments" element={<Navigate to="/content-studio/signals" replace />} />

        {/* Product Catalog — staff get read-only via in-page gating */}
        <Route path="/products" element={
          <ProtectedRoute><ProductCatalog /></ProtectedRoute>
        } />

        {/* Inventory (staff + owner) */}
        <Route path="/inventory" element={<ProtectedRoute><InventoryHub /></ProtectedRoute>} />
        <Route path="/inventory/stock-check" element={<ProtectedRoute><StockCheckAll /></ProtectedRoute>} />
        <Route path="/inventory/stock" element={<ProtectedRoute><StockManager /></ProtectedRoute>} />
        <Route path="/inventory/procurement" element={<ProtectedRoute><OwnerRoute><ProcurementOrders /></OwnerRoute></ProtectedRoute>} />
        <Route path="/inventory/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
        <Route path="/inventory/intelligence" element={<ProtectedRoute><OwnerRoute><InventoryIntelligence /></OwnerRoute></ProtectedRoute>} />

        {/* Analytics: finance is canonical, analytics-legacy kept as a safe alias */}
        <Route path="/analytics" element={<Navigate to="/finance" replace />} />
        <Route path="/finance" element={<ProtectedRoute><PermissionRoute feature="finance"><FinanceDashboard /></PermissionRoute></ProtectedRoute>} />
        <Route path="/marketing" element={<ProtectedRoute><PermissionRoute feature="marketing"><MarketingDashboard /></PermissionRoute></ProtectedRoute>} />
        <Route path="/analytics-legacy" element={<Navigate to="/finance" replace />} />

        {/* Loyalty — Nochi V3.01 (owner + staff) */}
        <Route path="/loyalty" element={<ProtectedRoute><LoyaltyDashboard /></ProtectedRoute>} />
        <Route path="/loyalty/customers" element={<ProtectedRoute><LoyaltyCustomers /></ProtectedRoute>} />
        <Route path="/loyalty/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
        <Route path="/loyalty/rewards" element={<ProtectedRoute><LoyaltyRewards /></ProtectedRoute>} />
        <Route path="/loyalty/qr" element={<ProtectedRoute><LoyaltyQR /></ProtectedRoute>} />
        <Route path="/loyalty/settings" element={<ProtectedRoute><LoyaltySettings /></ProtectedRoute>} />
        <Route path="/loyalty/leaderboard" element={<ProtectedRoute><LoyaltyLeaderboard /></ProtectedRoute>} />
        <Route path="/loyalty/stamp" element={<ProtectedRoute><LoyaltyStamp /></ProtectedRoute>} />
        <Route path="/loyalty/gestures" element={<ProtectedRoute><LoyaltyGestures /></ProtectedRoute>} />
        <Route path="/loyalty/spin" element={<ProtectedRoute><LoyaltySpinWheel /></ProtectedRoute>} />
        <Route path="/loyalty/feedback" element={<ProtectedRoute><LoyaltyFeedback /></ProtectedRoute>} />
        <Route path="/loyalty/intelligence" element={<ProtectedRoute><OwnerRoute><LoyaltyIntelligence /></OwnerRoute></ProtectedRoute>} />

        {/* Experience OS — Experiments + Messages */}
        <Route path="/experiments" element={<ProtectedRoute><OwnerRoute><Experiments /></OwnerRoute></ProtectedRoute>} />
        <Route path="/experiments/:id" element={<ProtectedRoute><OwnerRoute><ExperimentDetail /></OwnerRoute></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><OwnerRoute><Messages /></OwnerRoute></ProtectedRoute>} />

        {/* Ideas Module */}
        <Route path="/ideas" element={<ProtectedRoute><IdeasBoard /></ProtectedRoute>} />
        <Route path="/ideas/categories" element={<ProtectedRoute><OwnerRoute><IdeasCategories /></OwnerRoute></ProtectedRoute>} />

        {/* Vestaboard */}
        <Route path="/vestaboard" element={<ProtectedRoute><Vestaboard /></ProtectedRoute>} />

        {/* Accounting — chart of accounts + double-entry GL (accountant/owner) */}
        <Route path="/accounting"       element={<ProtectedRoute><PermissionRoute feature="accounting"><AccountingDashboard /></PermissionRoute></ProtectedRoute>} />

        {/* Ops Checklist — module ships disabled; UI handles the off case */}
        <Route path="/ops"          element={<ProtectedRoute><PermissionRoute feature="ops"><OpsChecklist /></PermissionRoute></ProtectedRoute>} />
        <Route path="/ops/dashboard" element={<ProtectedRoute><PermissionRoute feature="ops"><OpsDashboard /></PermissionRoute></ProtectedRoute>} />
        <Route path="/ops/settings"  element={<ProtectedRoute><PermissionRoute feature="ops"><OpsSettings /></PermissionRoute></ProtectedRoute>} />

        {/* Customer-facing loyalty card */}
        {/* /my-card and /loyalty/register removed — customers use noch.cloud/#loyalty */}

        {/* POS System */}
        <Route path="/kiosk" element={<ProtectedRoute><KioskEntry /></ProtectedRoute>} />
        <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
        <Route path="/pos" element={<ProtectedRoute><POSHome /></ProtectedRoute>} />
        <Route path="/pos/:branchId" element={<ProtectedRoute><POSTerminal /></ProtectedRoute>} />
        <Route path="/pos/:branchId/end-of-day" element={<ProtectedRoute><POSEndOfDay /></ProtectedRoute>} />
        <Route path="/pos/:branchId/inventory" element={<ProtectedRoute><POSInventory /></ProtectedRoute>} />
        <Route path="/pos/:branchId/settings" element={<ProtectedRoute><POSSettings /></ProtectedRoute>} />
        <Route path="/pos/:branchId/products" element={<ProtectedRoute><POSProducts /></ProtectedRoute>} />
        <Route path="/pos/:branchId/stock-check" element={<ProtectedRoute><POSStockCheck /></ProtectedRoute>} />
        <Route path="/pos/:branchId/orders" element={<ProtectedRoute><POSOrders /></ProtectedRoute>} />
        <Route path="/pos/:branchId/sessions" element={<ProtectedRoute><POSSessions /></ProtectedRoute>} />
        <Route path="/pos/:branchId/reports" element={<ProtectedRoute><POSReports /></ProtectedRoute>} />
        <Route path="/pos/:branchId/modifiers" element={<ProtectedRoute><POSModifiers /></ProtectedRoute>} />
        <Route path="/pos/:branchId/tables" element={<ProtectedRoute><OwnerRoute><TableQRGenerator /></OwnerRoute></ProtectedRoute>} />

        {/* Storefront (Public — No Auth Required) */}
        <Route path="/menu/:branchId" element={<Menu />} />
        <Route path="/feedback/:branchId" element={<Feedback />} />
        <Route path="/checkout/:branchId" element={<Checkout />} />
        <Route path="/order-confirmation" element={<OrderConfirmation />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
