import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useLanguage } from './contexts/LanguageContext'

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

// Content Studio
import ContentStudio from './pages/content/ContentStudio'
import Studio from './pages/content/Studio'
import BrandSetup from './pages/content/BrandSetup'
import BrandDetail from './pages/content/BrandDetail'
import ReviewQueue from './pages/content/ReviewQueue'
import IdeaBank from './pages/content/IdeaBank'

// Inventory & Analytics
import InventoryHub from './pages/InventoryHub'
import StockManager from './pages/inventory/StockManager'
import Suppliers from './pages/inventory/Suppliers'
import ProcurementOrders from './pages/inventory/ProcurementOrders'
import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard'

// Staff / Roles
import RoleManager from './pages/staff/RoleManager'

// POS System
import POSHome from './modules/pos/pages/POSHome'
import POSTerminal from './modules/pos/pages/POSTerminal'
import POSEndOfDay from './modules/pos/pages/POSEndOfDay'
import POSInventory from './modules/pos/pages/POSInventory'
import POSSettings from './modules/pos/pages/POSSettings'
import POSProducts from './modules/pos/pages/POSProducts'
import POSPinLogin from './modules/pos/pages/POSPinLogin'
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
import LoyaltyGestures from './modules/loyalty/pages/LoyaltyGestures'
import LoyaltySpinWheel from './modules/loyalty/pages/LoyaltySpinWheel'
import MyCard from './modules/loyalty/customer/MyCard'

// Sales
import Sales from './pages/Sales'

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

        <Route path="/cost-calculator" element={
          <ProtectedRoute><OwnerRoute><CostCalculator /></OwnerRoute></ProtectedRoute>
        } />

        {/* Content Studio */}
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

        {/* Inventory (staff + owner) */}
        <Route path="/inventory" element={<ProtectedRoute><InventoryHub /></ProtectedRoute>} />
        <Route path="/inventory/stock" element={<ProtectedRoute><StockManager /></ProtectedRoute>} />
        <Route path="/inventory/suppliers" element={<ProtectedRoute><OwnerRoute><Suppliers /></OwnerRoute></ProtectedRoute>} />
        <Route path="/inventory/procurement" element={<ProtectedRoute><OwnerRoute><ProcurementOrders /></OwnerRoute></ProtectedRoute>} />

        {/* Analytics (owner only) */}
        <Route path="/analytics" element={<ProtectedRoute><OwnerRoute><AnalyticsDashboard /></OwnerRoute></ProtectedRoute>} />

        {/* Sales */}
        <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />

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
        <Route path="/loyalty/spin/:customerId" element={<ProtectedRoute><LoyaltySpinWheel /></ProtectedRoute>} />

        {/* Ideas Module */}
        <Route path="/ideas" element={<ProtectedRoute><IdeasBoard /></ProtectedRoute>} />
        <Route path="/ideas/categories" element={<ProtectedRoute><OwnerRoute><IdeasCategories /></OwnerRoute></ProtectedRoute>} />

        {/* Vestaboard */}
        <Route path="/vestaboard" element={<ProtectedRoute><Vestaboard /></ProtectedRoute>} />

        {/* Customer-facing loyalty card */}
        <Route path="/my-card" element={<ProtectedRoute><MyCard /></ProtectedRoute>} />

        {/* POS System */}
        <Route path="/pos" element={<ProtectedRoute><POSHome /></ProtectedRoute>} />
        <Route path="/pos/pin" element={<ProtectedRoute><POSPinLogin /></ProtectedRoute>} />
        <Route path="/pos/:branchId" element={<ProtectedRoute><POSTerminal /></ProtectedRoute>} />
        <Route path="/pos/:branchId/end-of-day" element={<ProtectedRoute><POSEndOfDay /></ProtectedRoute>} />
        <Route path="/pos/:branchId/inventory" element={<ProtectedRoute><POSInventory /></ProtectedRoute>} />
        <Route path="/pos/:branchId/settings" element={<ProtectedRoute><POSSettings /></ProtectedRoute>} />
        <Route path="/pos/:branchId/products" element={<ProtectedRoute><POSProducts /></ProtectedRoute>} />
        <Route path="/pos/:branchId/tables" element={<ProtectedRoute><OwnerRoute><TableQRGenerator /></OwnerRoute></ProtectedRoute>} />

        {/* Settings — Roles alias */}
        <Route path="/settings/roles" element={<ProtectedRoute><OwnerRoute><RoleManager /></OwnerRoute></ProtectedRoute>} />

        {/* Storefront (Public — No Auth Required) */}
        <Route path="/menu/:branchId" element={<Menu />} />
        <Route path="/checkout/:branchId" element={<Checkout />} />
        <Route path="/order-confirmation" element={<OrderConfirmation />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
