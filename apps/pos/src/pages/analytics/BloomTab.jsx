// BloomTab.jsx — Bloomly Odoo data view for Bloom Abu Nawas branch

import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, ShoppingBag, Receipt, Users, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const PERIODS = [
  { id: '7',  label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
]

function StatCard({ icon: Icon, label, value, color = 'text-noch-green', sub }) {
  return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-noch-muted text-xs uppercase tracking-wide">
        <Icon size={13} className={color} />
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-noch-muted text-xs">{sub}</div>}
    </div>
  )
}

export default function BloomTab() {
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => { load() }, [days])

  async function load() {
    setLoading(true)
    try {
      const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString()

      const [
        { data: branchRow },
        { data: syncLog },
      ] = await Promise.all([
        supabase.from('pos_branches').select('id').eq('name', 'Bloom Abu Nawas').maybeSingle(),
        supabase.from('bloom_sync_log').select('*').order('synced_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      setLastSync(syncLog)

      if (!branchRow) {
        setData(null)
        setLoading(false)
        return
      }

      const branchId = branchRow.id

      const [
        { data: sales },
        { data: costs },
      ] = await Promise.all([
        supabase.from('sales_transactions')
          .select('total, quantity, category, sold_at')
          .eq('branch_id', branchId)
          .eq('source', 'bloomly_odoo')
          .gte('sold_at', since),
        supabase.from('operating_costs')
          .select('amount, cost_type, period_start')
          .eq('branch_id', branchId)
          .eq('source', 'bloomly_odoo')
          .gte('period_start', since.slice(0, 10)),
      ])

      const revenue = (sales || []).reduce((s, r) => s + parseFloat(r.total || 0), 0)
      const totalItems = (sales || []).reduce((s, r) => s + parseFloat(r.quantity || 0), 0)
      const orderCount = (sales || []).length

      const costByType = {}
      for (const c of costs || []) {
        const t = c.cost_type || 'Other'
        costByType[t] = (costByType[t] || 0) + parseFloat(c.amount || 0)
      }
      const totalCosts = Object.values(costByType).reduce((s, v) => s + v, 0)

      const laborCost = costByType['Labor/Salaries'] || 0
      const vendorCost = costByType['Vendor Bill'] || 0
      const grossProfit = revenue - totalCosts
      const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

      // Daily breakdown for trend
      const byDay = {}
      for (const r of sales || []) {
        const day = r.sold_at?.slice(0, 10)
        if (day) byDay[day] = (byDay[day] || 0) + parseFloat(r.total || 0)
      }
      const trend = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))

      setData({ revenue, totalItems, orderCount, totalCosts, laborCost, vendorCost, grossProfit, margin, costByType, trend })
    } catch (err) {
      console.error('BloomTab load error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="text-xl">☕</div>
          <div>
            <h2 className="text-white font-semibold">Bloom Abu Nawas</h2>
            <p className="text-noch-muted text-xs">Data synced from Bloomly Odoo POS</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-noch-dark border border-noch-border rounded-lg p-1">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setDays(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${days === p.id ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sync status */}
      {lastSync && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
          lastSync.status === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {lastSync.status === 'success'
            ? <CheckCircle size={13} />
            : <AlertCircle size={13} />}
          Last sync: {new Date(lastSync.synced_at).toLocaleString()} ·{' '}
          {lastSync.orders_synced} order lines · {lastSync.bills_synced} bills · {lastSync.payslips_synced} payslips
          {lastSync.error_message && <span className="ml-2 text-red-300">{lastSync.error_message}</span>}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-noch-muted">
          <Loader2 className="animate-spin" size={20} /> Loading Bloom data...
        </div>
      ) : !data ? (
        <div className="bg-noch-card border border-noch-border rounded-xl p-12 text-center">
          <RefreshCw size={36} className="mx-auto text-noch-muted mb-3 opacity-40" />
          <p className="text-noch-muted text-sm font-medium mb-1">No Bloom data yet</p>
          <p className="text-noch-muted text-xs max-w-sm mx-auto">
            Run the sync script to pull data from Bloomly Odoo into this dashboard.
          </p>
          <div className="mt-4 bg-noch-dark border border-noch-border rounded-lg p-3 text-left font-mono text-xs text-noch-muted max-w-sm mx-auto">
            <span className="text-noch-green">$</span>{' '}
            <span className="text-white">set SUPABASE_SERVICE_KEY=eyJ...</span><br />
            <span className="text-noch-green">$</span>{' '}
            <span className="text-white">python scripts/bloomly_sync.py</span>
          </div>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={TrendingUp}
              label="Revenue"
              value={`${data.revenue.toLocaleString('en', { maximumFractionDigits: 0 })} LYD`}
              color="text-noch-green"
              sub={`${data.orderCount.toLocaleString()} line items`}
            />
            <StatCard
              icon={ShoppingBag}
              label="Items Sold"
              value={data.totalItems.toLocaleString('en', { maximumFractionDigits: 0 })}
              color="text-blue-400"
            />
            <StatCard
              icon={Receipt}
              label="Total Costs"
              value={`${data.totalCosts.toLocaleString('en', { maximumFractionDigits: 0 })} LYD`}
              color="text-red-400"
              sub={`Bills + salaries`}
            />
            <StatCard
              icon={TrendingUp}
              label="Net Profit"
              value={`${data.grossProfit.toLocaleString('en', { maximumFractionDigits: 0 })} LYD`}
              color={data.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
              sub={`${data.margin.toFixed(1)}% margin`}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* P&L breakdown */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h3 className="text-white text-sm font-semibold mb-4">P&L Breakdown</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-noch-muted">Revenue</span>
                  <span className="text-noch-green font-semibold tabular-nums">
                    {data.revenue.toLocaleString('en', { maximumFractionDigits: 0 })} LYD
                  </span>
                </div>
                {Object.entries(data.costByType).map(([type, amt]) => (
                  <div key={type} className="flex justify-between">
                    <span className="text-noch-muted pl-3">− {type}</span>
                    <span className="text-red-400 tabular-nums">
                      {amt.toLocaleString('en', { maximumFractionDigits: 0 })} LYD
                    </span>
                  </div>
                ))}
                <div className="border-t border-noch-border pt-2 flex justify-between font-semibold">
                  <span className="text-white">Net Profit</span>
                  <span className={`tabular-nums ${data.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.grossProfit.toLocaleString('en', { maximumFractionDigits: 0 })} LYD
                  </span>
                </div>
              </div>
            </div>

            {/* Daily trend */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h3 className="text-white text-sm font-semibold mb-4">Daily Revenue Trend</h3>
              {data.trend.length === 0 ? (
                <p className="text-noch-muted text-xs">No daily data available.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.trend.slice(-14).map(([day, rev]) => {
                    const maxRev = Math.max(...data.trend.map(([, v]) => v))
                    const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0
                    return (
                      <div key={day} className="flex items-center gap-2 text-xs">
                        <span className="text-noch-muted w-20 shrink-0">{day.slice(5)}</span>
                        <div className="flex-1 bg-noch-dark rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-noch-green rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-white tabular-nums w-20 text-right">
                          {rev.toLocaleString('en', { maximumFractionDigits: 0 })} LYD
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sync instructions */}
          <div className="bg-noch-card border border-noch-border rounded-xl p-5">
            <h3 className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
              <RefreshCw size={13} className="text-noch-muted" /> Keep data fresh
            </h3>
            <p className="text-noch-muted text-xs mb-3">
              Run the sync script to pull the latest data from Bloomly Odoo. Recommended: schedule it daily.
            </p>
            <div className="bg-noch-dark border border-noch-border rounded-lg p-3 font-mono text-xs space-y-1">
              <div>
                <span className="text-noch-green">$</span>{' '}
                <span className="text-noch-muted"># Set your Supabase service_role key once:</span>
              </div>
              <div>
                <span className="text-noch-green">$</span>{' '}
                <span className="text-white">set SUPABASE_SERVICE_KEY=your_service_role_key</span>
              </div>
              <div className="mt-1">
                <span className="text-noch-green">$</span>{' '}
                <span className="text-noch-muted"># Sync last 30 days:</span>
              </div>
              <div>
                <span className="text-noch-green">$</span>{' '}
                <span className="text-white">python scripts/bloomly_sync.py</span>
              </div>
              <div>
                <span className="text-noch-green">$</span>{' '}
                <span className="text-noch-muted"># Or sync everything from the start:</span>
              </div>
              <div>
                <span className="text-noch-green">$</span>{' '}
                <span className="text-white">python scripts/bloomly_sync.py --all</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
