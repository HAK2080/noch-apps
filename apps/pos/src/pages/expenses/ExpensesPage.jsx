// ExpensesPage.jsx — Cost Center Expense Tracking Module
// Tabs: Submit | My Expenses | Approve | Dashboard | Settings (owner)
import { useState, useEffect } from 'react'
import { Receipt } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { supabase } from '../../lib/supabase'
import { loadCostCenters, loadCategories, loadRates } from './lib/expensesData'
import SubmitTab from './SubmitTab'
import MyExpensesTab from './MyExpensesTab'
import ApproveTab from './ApproveTab'
import DashboardTab from './DashboardTab'
import SettingsTab from './SettingsTab'

export default function ExpensesPage() {
  const { user, profile, isOwner } = useAuth()
  const { hasAccess } = usePermissions()
  const [activeTab, setActiveTab] = useState('submit')
  const [costCenters, setCostCenters] = useState([])
  const [categories, setCategories] = useState([])
  const [rates, setRates] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  const canApprove = isOwner || hasAccess('expenses_approve')

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { if (canApprove) loadPendingCount() }, [refreshKey, canApprove])

  async function loadMeta() {
    const [ccs, cats, rs] = await Promise.all([loadCostCenters(), loadCategories(), loadRates()])
    setCostCenters(ccs)
    setCategories(cats)
    setRates(rs)
  }

  async function loadPendingCount() {
    const { count } = await supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    setPendingCount(count || 0)
  }

  function refresh() { setRefreshKey(k => k + 1) }

  const tabs = [
    { id: 'submit',    label: 'Submit',      show: true },
    { id: 'mine',      label: 'My Expenses', show: true },
    { id: 'approve',   label: pendingCount > 0 ? `Approve (${pendingCount})` : 'Approve', show: canApprove },
    { id: 'dashboard', label: 'Dashboard',   show: canApprove },
    { id: 'settings',  label: 'Settings',    show: isOwner },
  ].filter(t => t.show)

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt size={22} className="text-noch-green" /> Expenses
          </h1>
          <p className="text-noch-muted text-sm mt-1">Log, approve, and track costs by cost center</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-noch-card border border-noch-border rounded-xl p-1 flex-wrap">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                ${activeTab === tab.id ? 'bg-noch-green text-black' : 'text-noch-muted hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'submit' && (
          <SubmitTab
            user={user} profile={profile} isOwner={isOwner}
            costCenters={costCenters} categories={categories} rates={rates}
            onSubmitted={refresh}
          />
        )}
        {activeTab === 'mine' && (
          <MyExpensesTab userId={user?.id} refreshKey={refreshKey} />
        )}
        {activeTab === 'approve' && canApprove && (
          <ApproveTab
            actorId={user?.id} isOwner={isOwner} refreshKey={refreshKey} onAction={refresh}
            costCenters={costCenters} categories={categories} rates={rates}
          />
        )}
        {activeTab === 'dashboard' && canApprove && (
          <DashboardTab refreshKey={refreshKey} />
        )}
        {activeTab === 'settings' && isOwner && (
          <SettingsTab onMetaChanged={loadMeta} />
        )}
      </div>
    </Layout>
  )
}
