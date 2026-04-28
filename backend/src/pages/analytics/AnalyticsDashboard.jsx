// AnalyticsDashboard.jsx — Analytics module tab controller

import { useState } from 'react'
import { BarChart3, Building2, Tag, Layers, Brain, DollarSign, Coffee } from 'lucide-react'
import Layout from '../../components/Layout'
import { usePermission } from '../../lib/usePermission'
import ProtectedFeature from '../../components/shared/ProtectedFeature'
import OverviewTab from './OverviewTab'
import BranchTab from './BranchTab'
import CategoryTab from './CategoryTab'
import BusinessLinesTab from './BusinessLinesTab'
import IntelligenceTab from './IntelligenceTab'
import FinancialTab from './FinancialTab'
import BloomTab from './BloomTab'

const TABS = [
  { id: 'overview',   label: 'Overview',       icon: BarChart3,  feature: 'analytics', action: 'view' },
  { id: 'branch',     label: 'By Branch',       icon: Building2,  feature: 'analytics', action: 'view' },
  { id: 'category',   label: 'By Category',     icon: Tag,        feature: 'analytics', action: 'view' },
  { id: 'lines',      label: 'Business Lines',  icon: Layers,     feature: 'analytics', action: 'view' },
  { id: 'financial',  label: 'Financial',       icon: DollarSign, feature: 'analytics', action: 'financial' },
  // Bloom tab hidden per owner request — flip back when ready to surface again
  // { id: 'bloom',      label: 'Bloom',           icon: Coffee,     feature: 'analytics', action: 'financial' },
  { id: 'ai',         label: 'AI Insights',     icon: Brain,      feature: 'analytics', action: 'financial' },
]

export default function AnalyticsDashboard() {
  const can = usePermission()
  const [tab, setTab] = useState('overview')

  const visibleTabs = TABS.filter(t => can(t.feature, t.action))

  // If current tab got hidden, fall back to first visible
  const activeTab = visibleTabs.find(t => t.id === tab) ? tab : visibleTabs[0]?.id || 'overview'

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BarChart3 className="text-noch-green" size={24} />
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
        </div>

        {/* Tab strip */}
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

        {/* Tab content — each tab guards itself, but we double-gate financial tabs */}
        <ProtectedFeature feature="analytics" action="view" fallback={
          <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
            <BarChart3 size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
            <p className="text-noch-muted text-sm">You don't have permission to view analytics.</p>
          </div>
        }>
          {activeTab === 'overview'  && <OverviewTab />}
          {activeTab === 'branch'    && <BranchTab />}
          {activeTab === 'category'  && <CategoryTab />}
          {activeTab === 'lines'     && <BusinessLinesTab />}
          {activeTab === 'financial' && (
            <ProtectedFeature feature="analytics" action="financial" fallback={
              <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
                <DollarSign size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
                <p className="text-noch-muted text-sm">Financial data is restricted to authorized roles.</p>
              </div>
            }>
              <FinancialTab />
            </ProtectedFeature>
          )}
          {activeTab === 'bloom' && (
            <ProtectedFeature feature="analytics" action="financial" fallback={
              <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
                <Coffee size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
                <p className="text-noch-muted text-sm">Bloom data is restricted to authorized roles.</p>
              </div>
            }>
              <BloomTab />
            </ProtectedFeature>
          )}
          {activeTab === 'ai' && (
            <ProtectedFeature feature="analytics" action="financial" fallback={
              <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
                <Brain size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
                <p className="text-noch-muted text-sm">AI Insights are restricted to authorized roles.</p>
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
