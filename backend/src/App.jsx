import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useLanguage } from './contexts/LanguageContext'
import FormStatePreserver from './components/FormStatePreserver'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Staff from './pages/Staff'
import Report from './pages/Report'
import MyTasks from './pages/MyTasks'
import Recipes from './pages/Recipes'
import RecipeDetail from './pages/RecipeDetail'
import CostCalculator from './pages/CostCalculator'

// Content Studio 2.0 (Noch 4.0)
import ContentStudio2 from './modules/contentStudio'

// Content Studio (legacy — kept for backward-compat)
import ContentStudio from './pages/content/ContentStudio'
import Studio from './pages/content/Studio'
import BrandSetup from './pages/content/BrandSetup'
import BrandDetail from './pages/content/BrandDetail'
import ReviewQueue from './pages/content/ReviewQueue'
import IdeaBank from './pages/content/IdeaBank'

// Product Catalog
import ProductCatalog from './pages/ProductCatalog'

// Inventory & Analytics
import InventoryHub from './pages/InventoryHub'
import StockManager from './pages/inventory/StockManager'
import ProcurementOrders from './pages/inventory/ProcurementOrders'
import StockCheckAll from './pages/StockCheckAll'
import BusinessAnalytics from './pages/BusinessAnalytics'

// POS System
import POSHome from './modules/pos/pages/POSHome'
import POSTerminal from './modules/pos/pages/POSTerminal'
import POSEndOfDay from './modules/pos/pages/POSEndOfDay'
import POSInventory from './modules/pos/pages/POSInventory'
import POSSettings from './modules/pos/pages/POSSettings'
import POSProducts from './modules/pos/pages/POSProducts'
import POSStockCheck from './modules/pos/pages/POSStockCheck'
import TableQRGenerator from './pages/TableQRGenerator'

// Ideas
import IdeasBoard from './pages/ideas/IdeasBoard'
import IdeasCategories from './pages/ideas/IdeasCategories'

// Vestaboard
import Vestaboard from './pages/Vestaboard'

// Loyalty — Nochi V3.01
import LoyaltyDashboard from './modules/loyalty/pages/LoyaltyDashboard'
import LoyaltyCustomers from './modules/loyalty/pages/LoyaltyCustomers'
import CustomerDetail from './modules/loyalty/pages/CustomerDetail'
import LoyaltyRewards from './modules/loyalty/pages/LoyaltyRewards'
import LoyaltyQR from './modules/loyalty/pages/LoyaltyQR'
import LoyaltySettings from './modules/loyalty/pages/LoyaltySettings'
import LoyaltyLeaderboard from './modules/loyalty/pages/LoyaltyLeaderboard'
import LoyaltyStamp from './modules/loyalty/pages/LoyaltyStamp'
import LoyaltySpinWheel from './modules/loyalty/pages/LoyaltySpinWheel'
import LoyaltyGestures from './modules/loyalty/pages/LoyaltyGestures'
import LoyaltyFeedback from './modules/loyalty/pages/LoyaltyFeedback'
import MyCard from './modules/loyalty/customer/MyCard'

import ExpensesPage from './pages/expenses/ExpensesPage'

// Storefront (Public)
import Menu from './pages/storefront/Menu'
import Checkout from './pages/storefront/Checkout'
import OrderConfirmation from './pages/storefront/OrderConfirmation'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useLanguage()
  if (loading) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center">
      <p className="text-noch-muted">{t('loading')}</p>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function OwnerRoute({ children }) {
  const { isOwner, loading } = useAuth()
  const { t } = useLanguage()
  if (loading) return null
  if (!isOwner) return <Navigate to="/my-tasks" replace />
  return children
}

function RootRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  return <Navigate to={profile.role === 'owner' ? '/dashboard' : '/my-tasks'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <FormStatePreserver />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />

        <Route path="/dashboard" element={
          <ProtectedRoute><OwnerRoute><Dashboard /></OwnerRoute></ProtectedRoute>
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
          <ProtectedRoute><ExpensesPage /></ProtectedRoute>
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

        {/* Product Catalog */}
        <Route path="/products" element={
          <ProtectedRoute><OwnerRoute><ProductCatalog /></OwnerRoute></ProtectedRoute>
        } />

        {/* Inventory (staff + owner) */}
        <Route path="/inventory" element={<ProtectedRoute><InventoryHub /></ProtectedRoute>} />
        <Route path="/inventory/stock-check" element={<ProtectedRoute><StockCheckAll /></ProtectedRoute>} />
        <Route path="/inventory/stock" element={<ProtectedRoute><StockManager /></ProtectedRoute>} />
        <Route path="/inventory/procurement" element={<ProtectedRoute><OwnerRoute><ProcurementOrders /></OwnerRoute></ProtectedRoute>} />

        {/* Analytics (owner only) */}
        <Route path="/analytics" element={<ProtectedRoute><OwnerRoute><BusinessAnalytics /></OwnerRoute></ProtectedRoute>} />

        {/* Loyalty — Nochi V3.01 (owner + staff) */}
        <Route path="/loyalty" element={<ProtectedRoute><LoyaltyDashboard /></ProtectedRoute>} />
        <Route path="/loyalty/customers" element={<ProtectedRoute><LoyaltyCustomers /></ProtectedRoute>} />
        <Route path="/loyalty/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
        <Route path="/loyalty/rewards" element={<ProtectedRoute><LoyaltyRewards /></ProtectedRoute>} />
        <Route path="/loyalty/qr" element={<ProtectedRoute><LoyaltyQR /></ProtectedRoute>} />
        <Route path="/loyalty/settings" element={<ProtectedRoute><LoyaltySettings /></ProtectedRoute>} />
        <Route path="/loyalty/leaderboard" element={<ProtectedRoute><LoyaltyLeaderboard /></ProtectedRoute>} />
        <Route path="/loyalty/stamp" element={<ProtectedRoute><LoyaltyStamp /></ProtectedRoute>} />
        <Route path="/loyalty/spin" element={<ProtectedRoute><LoyaltySpinWheel /></ProtectedRoute>} />
        <Route path="/loyalty/gestures" element={<ProtectedRoute><LoyaltyGestures /></ProtectedRoute>} />
        <Route path="/loyalty/feedback" element={<ProtectedRoute><LoyaltyFeedback /></ProtectedRoute>} />

        {/* Ideas Module */}
        <Route path="/ideas" element={<ProtectedRoute><IdeasBoard /></ProtectedRoute>} />
        <Route path="/ideas/categories" element={<ProtectedRoute><OwnerRoute><IdeasCategories /></OwnerRoute></ProtectedRoute>} />

        {/* Vestaboard */}
        <Route path="/vestaboard" element={<ProtectedRoute><Vestaboard /></ProtectedRoute>} />

        {/* Customer-facing loyalty card */}
        <Route path="/my-card" element={<ProtectedRoute><MyCard /></ProtectedRoute>} />

        {/* POS System */}
        <Route path="/pos" element={<ProtectedRoute><POSHome /></ProtectedRoute>} />
        <Route path="/pos/:branchId" element={<ProtectedRoute><POSTerminal /></ProtectedRoute>} />
        <Route path="/pos/:branchId/end-of-day" element={<ProtectedRoute><POSEndOfDay /></ProtectedRoute>} />
        <Route path="/pos/:branchId/inventory" element={<ProtectedRoute><POSInventory /></ProtectedRoute>} />
        <Route path="/pos/:branchId/settings" element={<ProtectedRoute><POSSettings /></ProtectedRoute>} />
        <Route path="/pos/:branchId/products" element={<ProtectedRoute><POSProducts /></ProtectedRoute>} />
        <Route path="/pos/:branchId/stock-check" element={<ProtectedRoute><POSStockCheck /></ProtectedRoute>} />
        <Route path="/pos/:branchId/tables" element={<ProtectedRoute><OwnerRoute><TableQRGenerator /></OwnerRoute></ProtectedRoute>} />

        {/* Storefront (Public — No Auth Required) */}
        <Route path="/menu/:branchId" element={<Menu />} />
        <Route path="/checkout/:branchId" element={<Checkout />} />
        <Route path="/order-confirmation" element={<OrderConfirmation />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
