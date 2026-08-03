import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useLanguage } from './contexts/LanguageContext'
import { usePermissions } from './contexts/PermissionsContext'
import { AUTH_POLICY, OWNER_POLICY, featurePolicy } from './lib/access-control'

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
const WorkforceHub     = lazy(() => import('./modules/workforce/pages/WorkforceHub'))
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
const WarehouseStock   = lazy(() => import('./pages/inventory/WarehouseStock'))
const BranchStock      = lazy(() => import('./pages/inventory/BranchStock'))
const TransferRequests = lazy(() => import('./pages/inventory/TransferRequests'))
const Transfers        = lazy(() => import('./pages/inventory/Transfers'))
const InTransit        = lazy(() => import('./pages/inventory/InTransit'))
const MovementHistory  = lazy(() => import('./pages/inventory/MovementHistory'))
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
const POSModifiers     = lazy(() => import('./modules/pos/pages/POSModifiers'))
const POSWaste         = lazy(() => import('./modules/pos/pages/POSWaste'))
const TableQRGenerator = lazy(() => import('./pages/TableQRGenerator'))

const IdeasBoard       = lazy(() => import('./pages/ideas/IdeasBoard'))
const IdeasCategories  = lazy(() => import('./pages/ideas/IdeasCategories'))
const Vestaboard       = lazy(() => import('./pages/Vestaboard'))
const VestaboardChannels = lazy(() => import('./pages/VestaboardChannels'))

const AccountingDashboard = lazy(() => import('./modules/accounting/AccountingDashboard'))

const OpsChecklist     = lazy(() => import('./modules/ops/pages/OpsChecklist'))
const OpsSettings      = lazy(() => import('./modules/ops/pages/OpsSettings'))
const OpsDashboard     = lazy(() => import('./modules/ops/pages/OpsDashboard'))

const LoyaltyDashboard = lazy(() => import('./modules/loyalty/pages/LoyaltyV2Dashboard'))
const LoyaltyCustomersV2 = lazy(() => import('./modules/loyalty/pages/LoyaltyCustomersV2'))
const LoyaltyV1Archive = lazy(() => import('./modules/loyalty/pages/LoyaltyV1Archive'))
const LoyaltyMissionsV2 = lazy(() => import('./modules/loyalty/pages/LoyaltyMissionsV2'))
const LoyaltyCheckoutClaim = lazy(() => import('./modules/loyalty/pages/LoyaltyCheckoutClaim'))

const ExpensesPage     = lazy(() => import('./pages/expenses/ExpensesPage'))
const SnapReceipt      = lazy(() => import('./pages/snap/SnapReceipt'))

const PayrollPage      = lazy(() => import('./pages/PayrollPage'))

// Experience OS — Phase 1-10
const InventoryIntelligence = lazy(() => import('./pages/inventory/InventoryIntelligence'))
const LoyaltyIntelligence   = lazy(() => import('./modules/loyalty/pages/LoyaltyIntelligence'))
const Experiments           = lazy(() => import('./pages/Experiments'))
const ExperimentDetail      = lazy(() => import('./pages/ExperimentDetail'))
const Messages              = lazy(() => import('./pages/Messages'))

function ProtectedRoute({ children }) {
  const { user, profile, loading, signOut } = useAuth()
  const { t, lang } = useLanguage()
  const { accountEnabled, loading: permissionsLoading } = usePermissions()
  const location = useLocation()
  if (loading || (user && permissionsLoading)) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center">
      <p className="text-noch-muted">{t('loading')}</p>
    </div>
  )
  if (!user) {
    // Preserve where the user was heading (e.g. /kiosk) so login can return them.
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (!profile || !accountEnabled) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center p-6">
      <div className="card max-w-md text-center">
        <h1 className="text-white text-lg font-semibold">
          {lang === 'ar' ? 'الوصول إلى الحساب غير مفعّل' : 'Account access is not enabled'}
        </h1>
        <p className="mt-2 text-sm text-noch-muted">
          {lang === 'ar'
            ? 'بياناتك محفوظة. اطلب من المالك تفعيل دخولك إلى مساحة العمل.'
            : 'Your records are preserved. Ask the owner to enable your workspace access.'}
        </p>
        <button className="btn-secondary mt-5" onClick={signOut}>{t('logout')}</button>
      </div>
    </div>
  )
  return children
}

function KioskEntry() {
  // Flip kiosk mode on for this tab so POSHome and POSTerminal render
  // chromeless. Then render POSHome (the branch picker).
  enableKioskMode()
  return <POSHome />
}

function LegacyRedirect({ to }) {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    navigate(`${to}${location.search || ''}`, { replace: true })
  }, [location.search, navigate, to])
  return null
}

function LegacyContentBusinessRedirect() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const target = id ? `/content-studio/businesses/${id}` : '/content-studio/businesses'
    navigate(`${target}${location.search || ''}`, { replace: true })
  }, [id, location.search, navigate])
  return null
}

function AccessRoute({ policy = AUTH_POLICY, children }) {
  const { canAccess, loading, error, landingRoute } = usePermissions()
  const { lang } = useLanguage()
  if (loading) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center">
      <p className="text-noch-muted">{lang === 'ar' ? 'جارٍ التحقق من الصلاحيات…' : 'Checking access…'}</p>
    </div>
  )
  if (!error && canAccess(policy)) return children
  return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center p-6">
      <div className="card max-w-md text-center">
        <h1 className="text-white text-lg font-semibold">
          {lang === 'ar' ? 'لا تتوفر صلاحية لهذه الصفحة' : 'This page is not available for your role'}
        </h1>
        <p className="mt-2 text-sm text-noch-muted">
          {error
            ? (lang === 'ar' ? 'تعذر التحقق من الصلاحيات. لم يتم افتراض أي صلاحية.' : 'Permissions could not be verified. Access was not assumed.')
            : (lang === 'ar' ? 'يمكن للمالك تعديل الصلاحية من إدارة الأدوار.' : 'The owner can change this grant in Role Manager.')}
        </p>
        <a href={landingRoute} className="btn-secondary mt-5 inline-flex">
          {lang === 'ar' ? 'العودة لمساحة العمل' : 'Return to workspace'}
        </a>
      </div>
    </div>
  )
}

function RootRedirect() {
  const { loading, user } = useAuth()
  const { landingRoute, loading: permissionsLoading } = usePermissions()
  if (loading || permissionsLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={landingRoute} replace />
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
        <Route path="/loyalty/checkout/:token" element={<LoyaltyCheckoutClaim />} />

        <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />

        <Route path="/dashboard" element={
          <ProtectedRoute><AccessRoute policy={featurePolicy('dashboard')}><Dashboard /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/tasks" element={
          <ProtectedRoute><AccessRoute policy={OWNER_POLICY}><Tasks /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/tasks/:id" element={
          <ProtectedRoute><AccessRoute><TaskDetail /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/staff" element={
          <ProtectedRoute><AccessRoute policy={OWNER_POLICY}><WorkforceHub /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/staff/team" element={
          <ProtectedRoute><AccessRoute policy={OWNER_POLICY}><Staff /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/staff/my-profile" element={
          <ProtectedRoute><AccessRoute><MyProfile /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/staff/roles" element={
          <ProtectedRoute><AccessRoute policy={OWNER_POLICY}><RoleManager /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/payroll" element={
          <ProtectedRoute><AccessRoute policy={OWNER_POLICY}><PayrollPage /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/report" element={
          <ProtectedRoute><AccessRoute policy={featurePolicy('reports')}><Report /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/my-tasks" element={
          <ProtectedRoute><AccessRoute><MyTasks /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/recipes/:id" element={
          <ProtectedRoute><AccessRoute policy={featurePolicy('recipes')}><RecipeDetail /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/recipes" element={
          <ProtectedRoute><AccessRoute policy={featurePolicy('recipes')}><Recipes /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/cost-calculator/*" element={
          <ProtectedRoute><AccessRoute policy={OWNER_POLICY}><CostCalculator /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/expenses/*" element={
          <ProtectedRoute><AccessRoute policy={featurePolicy('expenses')}><ExpensesPage /></AccessRoute></ProtectedRoute>
        } />

        <Route path="/snap" element={
          <ProtectedRoute><AccessRoute policy={featurePolicy('expenses')}><SnapReceipt /></AccessRoute></ProtectedRoute>
        } />

        {/* Content Studio 2.0 (Noch 4.0) */}
        <Route path="/content-studio/*" element={
          <ProtectedRoute><AccessRoute policy={OWNER_POLICY}><ContentStudio2 /></AccessRoute></ProtectedRoute>
        } />

        
        {/* Legacy routes — redirect to new studio */}
        
        {/* Content Studio (legacy) */}
        <Route path="/content" element={<LegacyRedirect to="/content-studio" />} />
        <Route path="/content/studio" element={<LegacyRedirect to="/content-studio" />} />
        <Route path="/content/brand/setup" element={<LegacyRedirect to="/content-studio/businesses/new" />} />
        <Route path="/content/brands/new" element={<LegacyRedirect to="/content-studio/businesses/new" />} />
        <Route path="/content/brand/:id" element={<LegacyContentBusinessRedirect />} />
        <Route path="/content/review" element={<LegacyRedirect to="/content-studio/drafts" />} />
        <Route path="/content/ideas" element={<LegacyRedirect to="/content-studio/concepts" />} />
        {/* Legacy routes — redirect to new studio */}
        <Route path="/content/create" element={<LegacyRedirect to="/content-studio" />} />
        <Route path="/content/research" element={<LegacyRedirect to="/content-studio/inspiration" />} />
        <Route path="/content/calendar" element={<LegacyRedirect to="/content-studio/campaigns" />} />
        <Route path="/content/experiments" element={<LegacyRedirect to="/content-studio/signals" />} />

        {/* Product Catalog — staff get read-only via in-page gating */}
        <Route path="/products" element={
          <ProtectedRoute><AccessRoute policy={featurePolicy('products')}><ProductCatalog /></AccessRoute></ProtectedRoute>
        } />

        {/* Inventory (staff + owner) */}
        <Route path="/inventory" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><InventoryHub /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/stock-check" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><StockCheckAll /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/stock" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><StockManager /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/procurement" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><ProcurementOrders /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/suppliers" element={<ProtectedRoute><AccessRoute policy={featurePolicy('suppliers')}><Suppliers /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/warehouse" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><WarehouseStock /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/branch-stock" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><BranchStock /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/requests" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><TransferRequests /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/transfers" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><Transfers /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/in-transit" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><InTransit /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/movements" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><MovementHistory /></AccessRoute></ProtectedRoute>} />
        <Route path="/inventory/intelligence" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><InventoryIntelligence /></AccessRoute></ProtectedRoute>} />

        {/* Analytics: finance is canonical, analytics-legacy kept as a safe alias */}
        <Route path="/analytics" element={<Navigate to="/finance" replace />} />
        <Route path="/finance" element={<ProtectedRoute><AccessRoute policy={featurePolicy('finance')}><FinanceDashboard /></AccessRoute></ProtectedRoute>} />
        <Route path="/marketing" element={<ProtectedRoute><AccessRoute policy={featurePolicy('marketing')}><MarketingDashboard /></AccessRoute></ProtectedRoute>} />
        <Route path="/analytics-legacy" element={<LegacyRedirect to="/finance" />} />

        {/* Loyalty — Nochi V3.01 (owner + staff) */}
        <Route path="/loyalty" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><LoyaltyDashboard /></AccessRoute></ProtectedRoute>} />
        <Route path="/loyalty/archive-v1" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><LoyaltyV1Archive /></AccessRoute></ProtectedRoute>} />
        <Route path="/loyalty/missions" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><LoyaltyMissionsV2 /></AccessRoute></ProtectedRoute>} />
        <Route path="/loyalty/customers" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><LoyaltyCustomersV2 /></AccessRoute></ProtectedRoute>} />
        <Route path="/loyalty/rewards" element={<Navigate to="/loyalty/archive-v1" replace />} />
        <Route path="/loyalty/qr" element={<Navigate to="/loyalty" replace />} />
        <Route path="/loyalty/settings" element={<Navigate to="/loyalty" replace />} />
        <Route path="/loyalty/leaderboard" element={<Navigate to="/loyalty" replace />} />
        <Route path="/loyalty/stamp" element={<Navigate to="/loyalty" replace />} />
        <Route path="/loyalty/gestures" element={<Navigate to="/loyalty" replace />} />
        <Route path="/loyalty/spin" element={<Navigate to="/loyalty" replace />} />
        <Route path="/loyalty/feedback" element={<Navigate to="/loyalty" replace />} />
        <Route path="/loyalty/intelligence" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><LoyaltyIntelligence /></AccessRoute></ProtectedRoute>} />

        {/* Experience OS — Experiments + Messages */}
        <Route path="/experiments" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><Experiments /></AccessRoute></ProtectedRoute>} />
        <Route path="/experiments/:id" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><ExperimentDetail /></AccessRoute></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><Messages /></AccessRoute></ProtectedRoute>} />

        {/* Ideas Module */}
        <Route path="/ideas" element={<ProtectedRoute><AccessRoute policy={featurePolicy('ideas')}><IdeasBoard /></AccessRoute></ProtectedRoute>} />
        <Route path="/ideas/categories" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><IdeasCategories /></AccessRoute></ProtectedRoute>} />

        {/* Vestaboard */}
        <Route path="/vestaboard" element={<ProtectedRoute><AccessRoute policy={featurePolicy('vestaboard')}><Vestaboard /></AccessRoute></ProtectedRoute>} />
        <Route path="/vestaboard/channels" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><VestaboardChannels /></AccessRoute></ProtectedRoute>} />

        {/* Accounting — chart of accounts + double-entry GL (accountant/owner) */}
        <Route path="/accounting" element={<ProtectedRoute><AccessRoute policy={featurePolicy('accounting')}><AccountingDashboard /></AccessRoute></ProtectedRoute>} />

        {/* Ops Checklist — module ships disabled; UI handles the off case */}
        <Route path="/ops" element={<ProtectedRoute><AccessRoute policy={featurePolicy('ops')}><OpsChecklist /></AccessRoute></ProtectedRoute>} />
        <Route path="/ops/dashboard" element={<ProtectedRoute><AccessRoute policy={featurePolicy('ops', 'edit')}><OpsDashboard /></AccessRoute></ProtectedRoute>} />
        <Route path="/ops/settings" element={<ProtectedRoute><AccessRoute policy={featurePolicy('ops', 'edit')}><OpsSettings /></AccessRoute></ProtectedRoute>} />

        {/* Customer-facing loyalty card */}
        {/* /my-card and /loyalty/register removed — customers use noch.cloud/#loyalty */}

        {/* POS System */}
        <Route path="/kiosk" element={<ProtectedRoute><AccessRoute policy={featurePolicy('pos')}><KioskEntry /></AccessRoute></ProtectedRoute>} />
        <Route path="/sales" element={<ProtectedRoute><AccessRoute policy={featurePolicy('sales')}><Sales /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos" element={<ProtectedRoute><AccessRoute policy={featurePolicy('pos')}><POSHome /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId" element={<ProtectedRoute><AccessRoute policy={featurePolicy('pos')}><POSTerminal /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/end-of-day" element={<ProtectedRoute><AccessRoute policy={featurePolicy('pos_eod')}><POSEndOfDay /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/inventory" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><POSInventory /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/waste" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory', 'edit')}><POSWaste /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/settings" element={<ProtectedRoute><AccessRoute policy={featurePolicy('pos', 'edit')}><POSSettings /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/products" element={<ProtectedRoute><AccessRoute policy={featurePolicy('products', 'edit')}><POSProducts /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/stock-check" element={<ProtectedRoute><AccessRoute policy={featurePolicy('inventory')}><POSStockCheck /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/orders" element={<ProtectedRoute><AccessRoute policy={featurePolicy('pos')}><POSOrders /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/sessions" element={<ProtectedRoute><AccessRoute policy={featurePolicy('sales')}><POSSessions /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/reports" element={<ProtectedRoute><AccessRoute policy={featurePolicy('sales')}><Navigate to="/sales" replace /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/modifiers" element={<ProtectedRoute><AccessRoute policy={featurePolicy('products', 'edit')}><POSModifiers /></AccessRoute></ProtectedRoute>} />
        <Route path="/pos/:branchId/tables" element={<ProtectedRoute><AccessRoute policy={OWNER_POLICY}><TableQRGenerator /></AccessRoute></ProtectedRoute>} />

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
