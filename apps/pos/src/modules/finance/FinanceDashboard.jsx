// FinanceDashboard.jsx — entry for /finance.
// Replaces the old /analytics page. Existing analytics tabs
// (Overview, BranchTab, CategoryTab, FinancialTab, IntelligenceTab)
// are kept under "Overview" for legacy continuity; the new finance
// tabs are the focus.

import { useState } from 'react'
import {
  TrendingUp, BarChart3, Coffee, Wallet, Receipt, Upload, Link2, Target, Wrench, Network,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { usePermission } from '../../lib/usePermission'
import { useAuth } from '../../contexts/AuthContext'
import ProtectedFeature from '../../components/shared/ProtectedFeature'

import DailyPnLTab from './tabs/DailyPnLTab'
import MenuProfitabilityTab from './tabs/MenuProfitabilityTab'
import CashRunwayTab from './tabs/CashRunwayTab'
import ExpensesTab from './tabs/ExpensesTab'
import BankTab from './tabs/BankTab'
import RecipeLinkerTab from './tabs/RecipeLinkerTab'
import VarianceTab from './tabs/VarianceTab'
import CapexTab from './tabs/CapexTab'
import ForecastTab from './tabs/ForecastTab'
import ExecutiveSummaryTab from './tabs/ExecutiveSummaryTab'
import AllocationsTab from './tabs/AllocationsTab'

// Legacy tabs from /analytics — kept under "Overview" pill so previous
// dashboards aren't lost.
import IntelligenceTab from '../../pages/analytics/IntelligenceTab'

// Tab levels (keyed on the 'finance' feature in Manage Roles):
//   view → visible with finance can_access (read-only for non-editors)
//   edit → requires finance can_edit (bank import, cost mapping, capex,
//          forecast scenarios, AI insights)
const TABS = [
  { id: 'summary',      label: 'Owner overview',     icon: BarChart3,  level: 'view' },
  { id: 'pnl',         label: 'Daily profit',        icon: TrendingUp, level: 'view' },
  { id: 'menu',        label: 'Menu item profit',    icon: Coffee,     level: 'view' },
  { id: 'cash',        label: 'Cash position',       icon: Wallet,     level: 'view' },
  { id: 'expenses',    label: 'Expenses',           icon: Receipt,    level: 'view' },
  { id: 'allocations', label: 'Shared costs',        icon: Network,    level: 'owner' },
  { id: 'bank',        label: 'Bank activity',       icon: Upload,     level: 'edit' },
  { id: 'recipes',     label: 'Product costs',       icon: Link2,      level: 'edit' },
  { id: 'variance',    label: 'Budget vs actual',    icon: Target,     level: 'view' },
  { id: 'capex',       label: 'Equipment & assets',  icon: Wrench,     level: 'edit' },
  { id: 'forecast',    label: 'Plan ahead',          icon: TrendingUp, level: 'edit' },
  { id: 'ai',          label: 'AI insights',        icon: BarChart3,  level: 'edit' },
]

export default function FinanceDashboard() {
  const can = usePermission()
  const { isOwner } = useAuth()
  const [tab, setTab] = useState('summary')

  // readOnly: has finance view access but not edit — hide all edit affordances.
  const readOnly = !can('finance', 'edit')
  const visibleTabs = TABS.filter(t => {
    if (t.level === 'owner') return isOwner
    return t.level === 'edit' ? can('finance', 'edit') : can('finance', 'view')
  })
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

        <ProtectedFeature feature="finance" action="view" fallback={
          <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
            <BarChart3 size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
            <p className="text-noch-muted text-sm">You don't have permission to view Finance.</p>
          </div>
        }>
          {activeTab === 'summary'  && <ExecutiveSummaryTab />}
          {activeTab === 'pnl'      && <DailyPnLTab readOnly={readOnly} />}
          {activeTab === 'menu'     && <MenuProfitabilityTab readOnly={readOnly} />}
          {activeTab === 'cash'     && <CashRunwayTab readOnly={readOnly} />}
          {activeTab === 'expenses' && <ExpensesTab readOnly={readOnly} />}
          {activeTab === 'allocations' && <AllocationsTab />}
          {activeTab === 'bank'     && <BankTab />}
          {activeTab === 'recipes'  && <RecipeLinkerTab />}
          {activeTab === 'variance' && <VarianceTab readOnly={readOnly} />}
          {activeTab === 'capex'    && <CapexTab />}
          {activeTab === 'forecast' && <ForecastTab />}
          {activeTab === 'ai'       && (
            <ProtectedFeature feature="finance" action="edit" fallback={
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
