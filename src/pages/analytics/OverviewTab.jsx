// OverviewTab.jsx — Analytics overview with KPIs and revenue chart

import { useState, useEffect } from 'react'
import { DollarSign, ShoppingBag, TrendingUp, BarChart3, Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import KPICard from './components/KPICard'
import SVGLineChart from './components/SVGLineChart'

function getPeriodDates(period) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'today') {
    return { start: today.toISOString(), end: now.toISOString() }
  }
  if (period === 'week') {
    const start = new Date(today); start.setDate(today.getDate() - 7)
    return { start: start.toISOString(), end: now.toISOString() }
  }
  if (period === 'month') {
    const start = new Date(today); start.setDate(1)
    return { start: start.toISOString(), end: now.toISOString() }
  }
  if (period === '3months') {
    const start = new Date(today); start.setMonth(today.getMonth() - 3)
    return { start: start.toISOString(), end: now.toISOString() }
  }
  return { start: today.toISOString(), end: now.toISOString() }
}

export default function OverviewTab() {
  const [period, setPeriod] = useState('month')
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('pos_branches').select('id, name').eq('is_active', true)
      .then(({ data }) => setBranches(data || []))
  }, [])

  useEffect(() => { loadData() }, [period, branchId])

  async function loadData() {
    setLoading(true)
    try {
      const { start, end } = getPeriodDates(period)
      let query = supabase
        .from('pos_orders')
        .select('id, total, subtotal, created_at, branch_id, status')
        .gte('created_at', start)
        .lte('created_at', end)
        .eq('status', 'completed')
      if (branchId) query = query.eq('branch_id', branchId)
      const { data } = await query
      setOrders(data || [])
    } catch {}
    finally { setLoading(false) }
  }

  const totalRevenue = orders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0)
  const txCount = orders.length
  const avgOrder = txCount > 0 ? totalRevenue / txCount : 0

  // Revenue by day for chart
  const byDay = {}
  orders.forEach(o => {
    const day = o.created_at?.slice(0, 10)
    if (day) byDay[day] = (byDay[day] || 0) + (parseFloat(o.total) || 0)
  })
  const chartData = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label: label.slice(5), value }))

  const PERIODS = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: '3months', label: 'Last 3 Months' },
  ]

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-noch-dark border border-noch-border rounded-lg p-1">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p.id ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {branches.length > 0 && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            className="input text-sm py-1.5 px-3">
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-noch-card border border-noch-border rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
          <BarChart3 size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
          <p className="text-noch-muted text-sm">No completed orders found for this period.</p>
          <p className="text-noch-muted text-xs mt-1">Process orders in the POS terminal to see analytics here.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KPICard icon={DollarSign} label="Total Revenue" value={totalRevenue.toLocaleString('en', { maximumFractionDigits: 0 }) + ' LYD'} />
            <KPICard icon={ShoppingBag} label="Transactions" value={txCount.toLocaleString()} />
            <KPICard icon={TrendingUp} label="Avg Order" value={avgOrder.toFixed(1) + ' LYD'} />
          </div>

          {/* Revenue Chart */}
          {chartData.length > 1 && (
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-noch-muted mb-4">Revenue Over Time</h3>
              <SVGLineChart data={chartData} height={140} />
              <div className="flex justify-between text-xs text-noch-muted mt-2">
                {chartData.length > 0 && <span>{chartData[0].label}</span>}
                {chartData.length > 1 && <span>{chartData[chartData.length - 1].label}</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
