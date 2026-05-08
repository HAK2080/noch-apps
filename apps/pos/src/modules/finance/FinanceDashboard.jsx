// FinanceDashboard.jsx — entry for /finance.
// Replaces the old /analytics page. Existing analytics tabs
// (Overview, BranchTab, CategoryTab, FinancialTab, IntelligenceTab)
// are kept under "Overview" for legacy continuity; the new finance
// tabs are the focus.

import { useState } from 'react'
import {
  TrendingUp, BarChart3, Coffee, Wallet, Receipt, Clock, Upload, Link2, Target, Wrench,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { usePermission } from '../../lib/usePermission'
import ProtectedFeature from '../../components/shared/ProtectedFeature'

import DailyPnLTab from './tabs/DailyPnLTab'
import MenuProfitabilityTab from './tabs/MenuProfitabilityTab'
import CashRunwayTab from './tabs/CashRunwayTab'
import ExpensesTab from './tabs/ExpensesTab'
import ShiftsTab from './tabs/ShiftsTab'
import BankTab from './tabs/BankTab'
import RecipeLinkerTab from './tabs/RecipeLinkerTab'
import VarianceTab from './tabs/VarianceTab'
import CapexTab from './tabs/CapexTab'
import ForecastTab from './tabs/ForecastTab'

// Legacy tabs from /analytics — kept under "Overview" pill so previous
// dashboards aren't lost.
import OverviewTab from '../../pages/analytics/OverviewTab'
import IntelligenceTab from '../../pages/analytics/IntelligenceTab'

const TABS = [
  { id: 'pnl',         label: 'Daily P&L',          icon: TrendingUp, feature: 'analytics', action: 'view' },
  { id: 'menu',        label: 'Menu profit',        icon: Coffee,     feature: 'analytics', action: 'view' },
  { id: 'cash',        label: 'Cash & runway',      icon: Wallet,     feature: 'analytics', action: 'financial' },
  { id: 'expenses',    label: 'Expenses',           icon: Receipt,    feature: 'analytics', action: 'financial' },
  { id: 'shifts',      label: 'Shifts',             icon: Clock,      feature: 'analytics', action: 'financial' },
  { id: 'bank',        label: 'Bank',               icon: Upload,     feature: 'analytics', action: 'financial' },
  { id: 'recipes',     label: 'Cost mapping',       icon: Link2,      feature: 'analytics', action: 'financial' },
  { id: 'variance',    label: 'Variance',           icon: Target,     feature: 'analytics', action: 'financial' },
  { id: 'capex',       label: 'CapEx',              icon: Wrench,     feature: 'analytics', action: 'financial' },
  { id: 'forecast',    label: 'Forecast',           icon: TrendingUp, feature: 'analytics', action: 'financial' },
  { id: 'overview',    label: 'Overview (legacy)',  icon: BarChart3,  feature: 'analytics', action: 'view' },
  { id: 'ai',          label: 'AI insights',        icon: BarChart3,  feature: 'analytics', action: 'financial' },
]

export default function FinanceDashboard() {
  const can = usePermission()
  const [tab, setTab] = useState('pnl')

  const visibleTabs = TABS.filter(t => can(t.feature, t.action))
  const activeTab = visibleTabs.find(t => t.id === tab) ? tab : visibleTabs[0]?.id || 'pnl'

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Wallet className="text-noch-green" size={24} />
          <h1 className="text-2xl font-bold text-white">Finance</h1>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 border-b border-noch-border">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === t.id
                  ? 'border-noch-green text-noch-green'
                  : 'border-transparent text-noch-muted hover:text-white'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <ProtectedFeature feature="analytics" action="view" fallback={
          <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
            <BarChart3 size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
            <p className="text-noch-muted text-sm">You don't have permission to view Finance.</p>
          </div>
        }>
          {activeTab === 'pnl'      && <DailyPnLTab />}
          {activeTab === 'menu'     && <MenuProfitabilityTab />}
          {activeTab === 'cash'     && <CashRunwayTab />}
          {activeTab === 'expenses' && <ExpensesTab />}
          {activeTab === 'shifts'   && <ShiftsTab />}
          {activeTab === 'bank'     && <BankTab />}
          {activeTab === 'recipes'  && <RecipeLinkerTab />}
          {activeTab === 'variance' && <VarianceTab />}
          {activeTab === 'capex'    && <CapexTab />}
          {activeTab === 'forecast' && <ForecastTab />}
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'ai'       && (
            <ProtectedFeature feature="analytics" action="financial" fallback={
              <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
                <BarChart3 size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
                <p className="text-noch-muted text-sm">Restricted to authorised roles.</p>
              </div>
            }>
              <IntelligenceTab />
            </ProtectedFeature>
          )}
        </ProtectedFeature>
      </div>
    </Layout>
  )
}
