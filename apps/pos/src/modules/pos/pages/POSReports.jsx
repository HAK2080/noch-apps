// POSReports.jsx — branch-level sales reporting.
// Route: /pos/:branchId/reports
// Range presets (today/week/month/custom) + summary KPIs + by-product
// + by-barista. Backed by:
//   - pos_sales_daily view (totals by day, by payment method)
//   - pos_sales_by_product RPC
//   - pos_sales_by_barista RPC

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calendar, TrendingUp, ShoppingCart, Users, Package,
} from 'lucide-react'
import {
  getPOSBranch,
  getDailySalesRange, getSalesByProduct, getSalesByBarista,
} from '../lib/pos-supabase'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

function ymd(d) { return d.toISOString().slice(0, 10) }

const PRESETS = [
  { key: 'today', label: 'Today',    days: 0 },
  { key: 'week',  label: 'Week',     days: 6 },
  { key: 'month', label: 'Month',    days: 29 },
]

function presetRange(preset) {
  const to = new Date(); to.setHours(23, 59, 59, 999)
  const from = new Date(); from.setHours(0, 0, 0, 0)
  if (preset === 'today') return { from, to }
  const meta = PRESETS.find(p => p.key === preset)
  from.setDate(from.getDate() - (meta?.days ?? 0))
  return { from, to }
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-noch-green' }) {
  return (
    <div className="card text-center">
      {Icon && <Icon size={16} className={`mx-auto ${color} mb-1`} />}
      <p className="text-noch-muted text-xs">{label}</p>
      <p className="text-white font-bold text-lg">{value}</p>
      {sub && <p className="text-noch-muted text-[10px] mt-0.5">{sub}</p>}
    </div>
  )
}

export default function POSReports() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  // Preset + dates kept in a single state object so a preset change
  // updates both dates in one render (avoids cascading-renders lint).
  const initial = (() => {
    const { from, to } = presetRange('today')
    return { preset: 'today', fromDate: ymd(from), toDate: ymd(to) }
  })()
  const [range, setRange] = useState(initial)
  const { preset, fromDate, toDate } = range

  const choosePreset = (p) => {
    if (p === 'custom') { setRange(r => ({ ...r, preset: 'custom' })); return }
    const { from, to } = presetRange(p)
    setRange({ preset: p, fromDate: ymd(from), toDate: ymd(to) })
  }

  const [loading, setLoading] = useState(true)
  const [daily, setDaily] = useState([])
  const [byProduct, setByProduct] = useState([])
  const [byBarista, setByBarista] = useState([])

  useEffect(() => {
    if (!branchId) return
    getPOSBranch(branchId).then(setBranch).catch(() => {})
  }, [branchId])

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const fromIso = new Date(`${fromDate}T00:00:00`).toISOString()
    const toIso   = new Date(`${toDate}T23:59:59.999`).toISOString()
    Promise.all([
      getDailySalesRange(branchId, fromIso, toIso),
      getSalesByProduct(branchId, fromIso, toIso),
      getSalesByBarista(branchId, fromIso, toIso),
    ])
      .then(([d, p, b]) => {
        if (cancelled) return
        setDaily(d); setByProduct(p); setByBarista(b)
      })
      .catch(err => { if (!cancelled) toast.error(err.message || 'Failed to load reports') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [branchId, fromDate, toDate])

  const totals = useMemo(() => {
    const acc = { orders: 0, gross: 0, discounts: 0, cash: 0, card: 0, presto: 0, voided: 0 }
    for (const row of daily) {
      acc.orders += Number(row.orders) || 0
      acc.gross  += Number(row.gross)  || 0
      acc.discounts += Number(row.discounts) || 0
      acc.cash   += Number(row.cash_sales)  || 0
      acc.card   += Number(row.card_sales)  || 0
      acc.presto += Number(row.presto_sales) || 0
      acc.voided += Number(row.voided) || 0
    }
    return acc
  }, [daily])

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Sales Reports</h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
        </div>

        {/* Range presets */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => choosePreset(p.key)}
              className={`py-2 rounded-lg text-sm border ${
                preset === p.key
                  ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                  : 'border-noch-border text-noch-muted hover:border-noch-green/20'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => choosePreset('custom')}
            className={`py-2 rounded-lg text-sm border flex items-center justify-center gap-1 ${
              preset === 'custom'
                ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                : 'border-noch-border text-noch-muted hover:border-noch-green/20'
            }`}
          >
            <Calendar size={12} /> Custom
          </button>
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label block mb-1 text-xs">From</label>
              <input type="date" value={fromDate} onChange={e => setRange(r => ({ ...r, fromDate: e.target.value }))} className="input w-full text-sm" max={toDate} />
            </div>
            <div>
              <label className="label block mb-1 text-xs">To</label>
              <input type="date" value={toDate} onChange={e => setRange(r => ({ ...r, toDate: e.target.value }))} className="input w-full text-sm" min={fromDate} />
            </div>
          </div>
        )}

        {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard label="Gross sales" value={`${totals.gross.toFixed(2)} LYD`} sub={`${totals.orders} orders`} icon={TrendingUp} />
              <StatCard label="Cash" value={`${totals.cash.toFixed(2)}`} icon={ShoppingCart} color="text-yellow-400" />
              <StatCard label="Card" value={`${totals.card.toFixed(2)}`} icon={ShoppingCart} color="text-blue-400" />
              <StatCard label="Presto" value={`${totals.presto.toFixed(2)}`} icon={ShoppingCart} color="text-purple-400" />
              <StatCard label="Discounts" value={`${totals.discounts.toFixed(2)}`} color="text-yellow-400" />
              <StatCard label="Voided" value={`${totals.voided.toFixed(2)}`} color="text-red-400" />
              <StatCard label="Avg ticket" value={totals.orders ? `${(totals.gross / totals.orders).toFixed(2)}` : '—'} />
              <StatCard label="Days" value={daily.length} />
            </div>

            {/* Daily breakdown */}
            <div className="card mb-4">
              <h3 className="text-white font-semibold text-sm mb-2">Daily breakdown</h3>
              {daily.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">No sales in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-noch-muted">
                        <th className="text-left py-1">Day</th>
                        <th className="text-right py-1">Orders</th>
                        <th className="text-right py-1">Gross</th>
                        <th className="text-right py-1">Cash</th>
                        <th className="text-right py-1">Card</th>
                        <th className="text-right py-1">Presto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map(d => (
                        <tr key={d.day} className="border-t border-noch-border/40">
                          <td className="py-1 text-white">{d.day}</td>
                          <td className="py-1 text-right text-white">{d.orders}</td>
                          <td className="py-1 text-right text-noch-green">{Number(d.gross || 0).toFixed(2)}</td>
                          <td className="py-1 text-right text-yellow-400">{Number(d.cash_sales || 0).toFixed(2)}</td>
                          <td className="py-1 text-right text-blue-400">{Number(d.card_sales || 0).toFixed(2)}</td>
                          <td className="py-1 text-right text-purple-400">{Number(d.presto_sales || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* By product */}
            <div className="card mb-4">
              <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                <Package size={14} /> Top products
              </h3>
              {byProduct.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">No items sold.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {byProduct.slice(0, 20).map(p => (
                    <div key={p.product_id || p.product_name} className="flex justify-between text-sm border-b border-noch-border/40 last:border-0 py-1.5">
                      <span className="text-white truncate">{p.product_name}</span>
                      <span className="text-noch-muted text-xs ml-2 shrink-0">
                        {Number(p.qty).toFixed(0)} sold · <span className="text-noch-green">{Number(p.revenue).toFixed(2)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By barista */}
            <div className="card mb-4">
              <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                <Users size={14} /> By barista
              </h3>
              {byBarista.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-3">No served-by data in this range. (Enable PIN-required to capture this.)</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {byBarista.map(b => (
                    <div key={b.user_id || 'unknown'} className="flex justify-between text-sm border-b border-noch-border/40 last:border-0 py-1.5">
                      <span className="text-white">{b.full_name || 'Unattributed'}</span>
                      <span className="text-noch-muted text-xs ml-2 shrink-0">
                        {b.orders} orders · <span className="text-noch-green">{Number(b.revenue).toFixed(2)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
