import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useLanguage } from './contexts/LanguageContext'

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

// ── Code-split route components ──────────────────────────────────────
// Each import() becomes its own JS chunk Vite emits separately, fetched
// on first navigation to that route. Subsequent visits are cached.
const Tasks            = lazy(() => import('./pages/Tasks'))
const TaskDetail       = lazy(() => import('./pages/TaskDetail'))
const Staff            = lazy(() => import('./pages/Staff'))
const RoleManager      = lazy(() => import('./pages/staff/RoleManager'))
const Report           = lazy(() => import('./pages/Report'))
const Recipes          = lazy(() => import('./pages/Recipes'))
const RecipeDetail     = lazy(() => import('./pages/RecipeDetail'))
const CostCalculator   = lazy(() => import('./pages/CostCalculator'))

const ContentStudio2   = lazy(() => import('./modules/contentStudio'))
const ContentStudio    = lazy(() => import('./pages/content/ContentStudio'))
const Studio           = lazy(() => import('./pages/content/Studio'))
const BrandSetup       = lazy(() => import('./pages/content/BrandSetup'))
const BrandDetail      = lazy(() => import('./pages/content/BrandDetail'))
const ReviewQueue      = lazy(() => import('./pages/content/ReviewQueue'))
const IdeaBank         = lazy(() => import('./pages/content/IdeaBank'))

const ProductCatalog   = lazy(() => import('./pages/ProductCatalog'))
const InventoryHub     = lazy(() => import('./pages/InventoryHub'))
const StockManager     = lazy(() => import('./pages/inventory/StockManager'))
const ProcurementOrders= lazy(() => import('./pages/inventory/ProcurementOrders'))
const Suppliers        = lazy(() => import('./pages/inventory/Suppliers'))
const StockCheckAll    = lazy(() => import('./pages/StockCheckAll'))
const BusinessAnalytics= lazy(() => import('./pages/BusinessAnalytics'))
const FinanceDashboard = lazy(() => import('./modules/finance/FinanceDashboard'))
const MarketingDashboard = lazy(() => import('./modules/marketing/MarketingDashboard'))

const POSEndOfDay      = lazy(() => import('./modules/pos/pages/POSEndOfDay'))
const POSInventory     = lazy(() => import('./modules/pos/pages/POSInventory'))
const POSSettings      = lazy(() => import('./modules/pos/pages/POSSettings'))
const POSProducts      = lazy(() => import('./modules/pos/pages/POSProducts'))
const POSStockCheck    = lazy(() => import('./modules/pos/pages/POSStockCheck'))
const POSOrders        = lazy(() => import('./modules/pos/pages/POSOrders'))
const POSReports       = lazy(() => import('./modules/pos/pages/POSReports'))
const POSModifiers     = lazy(() => import('./modules/pos/pages/POSModifiers'))
const TableQRGenerator = lazy(() => import('./pages/TableQRGenerator'))

const IdeasBoard       = lazy(() => import('./pages/ideas/IdeasBoard'))
const IdeasCategories  = lazy(() => import('./pages/ideas/IdeasCategories'))
const Vestaboard       = lazy(() => import('./pages/Vestaboard'))

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

const ExpensesPage     = lazy(() => import('./pages/expenses/ExpensesPage'))

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

function OwnerRoute({ children }) {
  const { isOwner, loading } = useAuth()
  const { t } = useLanguage()
  if (loading) return null
  if (!isOwner) return <Navigate to="/my-tasks" replace />
  return children
}

function RootRedirect() {
  const { profile, loading, user } = useAuth()
  // Still loading initial auth state
  if (loading) return null
  // No user → not authenticated → go to login
  if (!user) return <Navigate to="/login" replace />
  // User is authenticated but profile hasn't loaded yet — wait (avoid redirect loop)
  if (!profile) return null
  // Owner lands on the dashboard; everyone else (manager/supervisor/staff)
  // lands on the POS branch picker — that's their daily entry point.
  return <Navigate to={profile.role === 'owner' ? '/dashboard' : '/pos'} replace />
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

        <Route path="/staff/roles" element={
          <ProtectedRoute><OwnerRoute><RoleManager /></OwnerRoute></ProtectedRoute>
        } />

        <Route path="/report" element={
          <ProtectedRoute><OwnerRoute><Report /></OwnerRoute></ProtectedRoute>
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
          <ProtectedRoute><OwnerRoute><ExpensesPage /></OwnerRoute></ProtectedRoute>
        } />

        {/* Content Studio 2.0 (Noch 4.0) */}
        <Route path="/content-studio/*" element={
          <ProtectedRoute><OwnerRoute><ContentStudio2 /></OwnerRoute></ProtectedRoute>
        } />

        {/* Content Studio (legacy) */}
        <Route path="/content" element={
          <ProtectedRoute><OwnerRoute><ContentStudio /></OwnerRoute></ProtectedRoute>
        } />
        <Route path="/content/studio" element={
          <ProtectedRoute><OwnerRoute><Studio /></OwnerRoute></ProtectedRoute>
        } />
        <Route path="/content/brand/setup" element={
          <ProtectedRoute><OwnerRoute><BrandSetup /></OwnerRoute></ProtectedRoute>
        } />
        <Route path="/content/brands/new" element={
          <ProtectedRoute><OwnerRoute><BrandSetup /></OwnerRoute></ProtectedRoute>
        } />
        <Route path="/content/brand/:id" element={
          <ProtectedRoute><OwnerRoute><BrandDetail /></OwnerRoute></ProtectedRoute>
        } />
        <Route path="/content/review" element={
          <ProtectedRoute><OwnerRoute><ReviewQueue /></OwnerRoute></ProtectedRoute>
        } />
        <Route path="/content/ideas" element={
          <ProtectedRoute><OwnerRoute><IdeaBank /></OwnerRoute></ProtectedRoute>
        } />
        {/* Legacy routes — redirect to new studio */}
        <Route path="/content/create" element={<Navigate to="/content/studio" replace />} />
        <Route path="/content/research" element={<Navigate to="/content" replace />} />
        <Route path="/content/calendar" element={<Navigate to="/content" replace />} />
        <Route path="/content/experiments" element={<Navigate to="/content" replace />} />

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

        {/* Analytics (owner only) */}
        <Route path="/analytics" element={<Navigate to="/finance" replace />} />
        <Route path="/finance" element={<ProtectedRoute><OwnerRoute><FinanceDashboard /></OwnerRoute></ProtectedRoute>} />
        <Route path="/marketing" element={<ProtectedRoute><OwnerRoute><MarketingDashboard /></OwnerRoute></ProtectedRoute>} />
        <Route path="/analytics-legacy" element={<ProtectedRoute><OwnerRoute><BusinessAnalytics /></OwnerRoute></ProtectedRoute>} />

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

        {/* Ideas Module */}
        <Route path="/ideas" element={<ProtectedRoute><IdeasBoard /></ProtectedRoute>} />
        <Route path="/ideas/categories" element={<ProtectedRoute><OwnerRoute><IdeasCategories /></OwnerRoute></ProtectedRoute>} />

        {/* Vestaboard */}
        <Route path="/vestaboard" element={<ProtectedRoute><Vestaboard /></ProtectedRoute>} />

        {/* Customer-facing loyalty card */}
        {/* /my-card and /loyalty/register removed — customers use noch.cloud/#loyalty */}

        {/* POS System */}
        <Route path="/kiosk" element={<ProtectedRoute><KioskEntry /></ProtectedRoute>} />
        <Route path="/pos" element={<ProtectedRoute><POSHome /></ProtectedRoute>} />
        <Route path="/pos/:branchId" element={<ProtectedRoute><POSTerminal /></ProtectedRoute>} />
        <Route path="/pos/:branchId/end-of-day" element={<ProtectedRoute><POSEndOfDay /></ProtectedRoute>} />
        <Route path="/pos/:branchId/inventory" element={<ProtectedRoute><POSInventory /></ProtectedRoute>} />
        <Route path="/pos/:branchId/settings" element={<ProtectedRoute><POSSettings /></ProtectedRoute>} />
        <Route path="/pos/:branchId/products" element={<ProtectedRoute><POSProducts /></ProtectedRoute>} />
        <Route path="/pos/:branchId/stock-check" element={<ProtectedRoute><POSStockCheck /></ProtectedRoute>} />
        <Route path="/pos/:branchId/orders" element={<ProtectedRoute><POSOrders /></ProtectedRoute>} />
        <Route path="/pos/:branchId/reports" element={<ProtectedRoute><POSReports /></ProtectedRoute>} />
        <Route path="/pos/:branchId/modifiers" element={<ProtectedRoute><POSModifiers /></ProtectedRoute>} />
        <Route path="/pos/:branchId/tables" element={<ProtectedRoute><OwnerRoute><TableQRGenerator /></OwnerRoute></ProtectedRoute>} />

        {/* Storefront (Public — No Auth Required) */}
        <Route path="/menu/:branchId" element={<Menu />} />
        <Route path="/checkout/:branchId" element={<Checkout />} />
        <Route path="/order-confirmation" element={<OrderConfirmation />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
