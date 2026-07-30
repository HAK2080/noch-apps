// Sales.jsx — Sales overview: real totals per branch + range presets,
// then drill into Orders or Sessions views.
// Route: /sales
//
// Figures come from the pos_sales_daily view, which buckets by BUSINESS day
// (5 AM → 5 AM Africa/Tripoli) so post-midnight sales count toward the
// evening's trading day.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Clock, Download, TrendingUp } from 'lucide-react'
import {
  getPOSBranches, getDailySalesRange, getSalesExportRows,
} from '../modules/pos/lib/pos-supabase'
import { businessToday, localYmd } from '../lib/businessDay'
import { getServedBy } from '../modules/pos/lib/pos-session'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import Layout from '../components/Layout'
import BusinessRangePicker from '../components/shared/BusinessRangePicker'
import { downloadCsv } from '../lib/exportCsv'
import toast from 'react-hot-toast'

const PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d',    label: '7 days', days: 6 },
  { key: 'month', label: 'Month', days: 29 },
]

function rangeFor(days) {
  const to = businessToday()
  const from = businessToday(); from.setDate(from.getDate() - days)
  return { fromDate: localYmd(from), toDate: localYmd(to) }
}

const fmt = n => Number(n || 0).toLocaleString('en', { maximumFractionDigits: 2 })

export default function Sales() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { isOwner, hasAccess } = usePermissions()
  // Session/shift totals: 'sales' permission for the logged-in profile, OR a
  // PIN-verified owner/supervisor on a shared terminal (role_permissions keys
  // off the Supabase login, not the PIN operator — keep the role fallback).
  const canViewSessions = isOwner || hasAccess('sales')
    || ['owner', 'supervisor'].includes(getServedBy()?.role)
    || profile?.role === 'supervisor'
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(() => ({ preset: 'today', ...rangeFor(0) }))
  const [totalsByBranch, setTotalsByBranch] = useState({})
  const [exportBranchId, setExportBranchId] = useState('all')
  const [exporting, setExporting] = useState(false)

  const choosePreset = (p) => {
    if (p === 'custom') { setRange(r => ({ ...r, preset: 'custom' })); return }
    const meta = PRESETS.find(x => x.key === p)
    setRange({ preset: p, ...rangeFor(meta?.days ?? 0) })
  }

  useEffect(() => {
    getPOSBranches()
      .then(list => { setBranches(list || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load per-branch totals for the selected range (canViewSessions only —
  // plain staff keep the navigation-only view).
  useEffect(() => {
    if (!canViewSessions || !branches.length) return
    let cancelled = false
    Promise.all(
      branches.map(b =>
        getDailySalesRange(b.id, range.fromDate, range.toDate)
          .then(rows => {
            const t = { gross: 0, orders: 0, cash: 0, card: 0, presto: 0 }
            for (const r of rows) {
              t.gross  += Number(r.gross) || 0
              t.orders += Number(r.orders) || 0
              t.cash   += Number(r.cash_sales) || 0
              t.card   += Number(r.card_sales) || 0
              t.presto += Number(r.presto_sales) || 0
            }
            return [b.id, t]
          })
          .catch(() => [b.id, null])
      )
    ).then(entries => { if (!cancelled) setTotalsByBranch(Object.fromEntries(entries)) })
    return () => { cancelled = true }
  }, [branches, canViewSessions, range.fromDate, range.toDate])

  const grand = Object.values(totalsByBranch).reduce((a, t) => {
    if (!t) return a
    a.gross += t.gross; a.orders += t.orders; a.cash += t.cash; a.card += t.card
    return a
  }, { gross: 0, orders: 0, cash: 0, card: 0 })

  const handleExport = async () => {
    if (!range.fromDate || !range.toDate || range.fromDate > range.toDate) {
      toast.error('Choose a valid export date range')
      return
    }

    setExporting(true)
    try {
      const selectedBranches = exportBranchId === 'all'
        ? branches
        : branches.filter(branch => branch.id === exportBranchId)
      const fromIso = new Date(`${range.fromDate}T00:00:00`).toISOString()
      const toIso = new Date(`${range.toDate}T23:59:59.999`).toISOString()
      const chunks = await Promise.all(
        selectedBranches.map(branch =>
          getSalesExportRows(branch.id, { from: fromIso, to: toIso })
            .then(rows => rows.map(row => ({ branch, row }))),
        ),
      )
      const exportRows = chunks.flat().map(({ branch, row }) => {
        const order = row.pos_orders || {}
        const created = order.created_at ? new Date(order.created_at) : null
        const quantity = Number(row.quantity) || 0
        const unitPrice = Number(row.unit_price) || 0
        const lineTotal = Number(row.total) || quantity * unitPrice
        const refundedQty = Number(row.refunded_qty) || 0
        const netQty = Math.max(0, quantity - refundedQty)
        const netLineTotal = quantity > 0 ? lineTotal * (netQty / quantity) : lineTotal
        return [
          order.created_at || '',
          created ? localYmd(created) : '',
          created ? String(created.getHours()).padStart(2, '0') : '',
          branch.name || order.pos_branches?.name || '',
          order.order_number || '',
          order.status || '',
          order.source || 'pos',
          order.payment_method || '',
          order.customer_name || '',
          order.customer_phone || '',
          order.table_number || '',
          order.pickup_code || '',
          order.served_by_profile?.full_name || '',
          row.product_id || '',
          row.product_name || '',
          row.product_name_ar || '',
          quantity,
          refundedQty,
          netQty,
          unitPrice.toFixed(2),
          lineTotal.toFixed(2),
          netLineTotal.toFixed(2),
          Number(order.subtotal || 0).toFixed(2),
          Number(order.discount_amount || 0).toFixed(2),
          Number(order.discount_pct || 0).toFixed(2),
          Number(order.total || 0).toFixed(2),
          order.shift_id || '',
          row.notes || '',
        ]
      })

      downloadCsv(
        `sales_detail_${exportBranchId === 'all' ? 'all_branches' : selectedBranches[0]?.name || 'branch'}_${range.fromDate}_${range.toDate}`,
        [
          'timestamp', 'date', 'hour', 'branch', 'order_number', 'order_status', 'source',
          'payment_method', 'customer_name', 'customer_phone', 'table_number', 'pickup_code',
          'served_by', 'product_id', 'product_name', 'product_name_ar', 'quantity',
          'refunded_qty', 'net_quantity', 'unit_price_lyd', 'line_total_lyd',
          'net_line_total_lyd', 'order_subtotal_lyd', 'order_discount_lyd',
          'order_discount_pct', 'order_total_lyd', 'shift_id', 'line_notes',
        ],
        exportRows,
      )
      toast.success(`Exported ${exportRows.length} sale lines`)
    } catch (err) {
      toast.error(err.message || 'Sales export failed')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="text-noch-muted text-center py-20">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-6">
        <h1 className="text-white font-bold text-2xl mb-2">Sales</h1>
        <p className="text-noch-muted text-sm mb-4">
          Business days run 5 AM → 5 AM, so late-night sales count toward the evening&apos;s day.
        </p>

        {canViewSessions && (
          <>
            {/* Range presets */}
            <div className="mb-4">
              <BusinessRangePicker presets={PRESETS} value={{ preset: range.preset, from: range.fromDate, to: range.toDate }} onChange={next => setRange({ preset: next.preset, fromDate: next.from, toDate: next.to })} />
            </div>
            <div className="card p-4 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Download size={15} className="text-noch-green" /> Export detailed sales
                  </h2>
                  <p className="text-noch-muted text-xs mt-1">One CSV row per sold item for the selected business-date range.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={exportBranchId} onChange={event => setExportBranchId(event.target.value)} className="input text-sm">
                    <option value="all">All branches</option>
                    {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <button onClick={handleExport} disabled={exporting || branches.length === 0} className="btn-primary text-sm px-3 py-2 flex items-center justify-center gap-2 whitespace-nowrap">
                    <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>
              </div>
            </div>
            {/* eslint-disable-next-line no-constant-binary-expression */}
            {false && <div className="flex flex-wrap items-center gap-2 mb-4">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => choosePreset(p.key)}
                  className={`text-sm px-3 py-1.5 rounded-lg border ${
                    range.preset === p.key
                      ? 'bg-noch-green/15 border-noch-green/50 text-noch-green'
                      : 'border-noch-border text-noch-muted hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => choosePreset('custom')}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  range.preset === 'custom'
                    ? 'bg-noch-green/15 border-noch-green/50 text-noch-green'
                    : 'border-noch-border text-noch-muted hover:text-white'
                }`}
              >
                Custom
              </button>
              {range.preset === 'custom' && (
                <>
                  <input
                    type="date" value={range.fromDate}
                    onChange={e => setRange(r => ({ ...r, fromDate: e.target.value }))}
                    className="input text-sm py-1.5"
                  />
                  <span className="text-noch-muted text-sm">→</span>
                  <input
                    type="date" value={range.toDate}
                    onChange={e => setRange(r => ({ ...r, toDate: e.target.value }))}
                    className="input text-sm py-1.5"
                  />
                </>
              )}
            </div>}

            {/* Grand total across branches */}
            <div className="card p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-noch-green" />
                <p className="text-noch-muted text-xs">
                  All branches · {range.fromDate} → {range.toDate}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">Gross</p>
                  <p className="text-noch-green font-bold text-lg leading-tight">{fmt(grand.gross)}</p>
                  <p className="text-noch-muted text-[10px]">LYD</p>
                </div>
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">Orders</p>
                  <p className="text-white font-bold text-lg leading-tight">{grand.orders}</p>
                  <p className="text-noch-muted text-[10px]">tickets</p>
                </div>
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">Cash</p>
                  <p className="text-white font-bold text-lg leading-tight">{fmt(grand.cash)}</p>
                  <p className="text-noch-muted text-[10px]">LYD</p>
                </div>
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">Card</p>
                  <p className="text-white font-bold text-lg leading-tight">{fmt(grand.card)}</p>
                  <p className="text-noch-muted text-[10px]">LYD</p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col gap-4">
          {branches.map(b => {
            const t = totalsByBranch[b.id]
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-semibold">{b.name}</p>
                    {b.address && <p className="text-noch-muted text-sm mt-0.5">{b.address}</p>}
                  </div>
                  {canViewSessions && t && (
                    <div className="text-right">
                      <p className="text-noch-green font-bold text-lg leading-tight">{fmt(t.gross)} <span className="text-xs">LYD</span></p>
                      <p className="text-noch-muted text-xs">{t.orders} orders · cash {fmt(t.cash)} · card {fmt(t.card)}</p>
                    </div>
                  )}
                </div>
                <div className={`grid ${canViewSessions ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                  <button
                    onClick={() => navigate(`/pos/${b.id}/orders`)}
                    className="btn-secondary text-sm py-2 flex items-center justify-center gap-2"
                  >
                    <ListOrdered size={14} /> Orders
                  </button>
                  {canViewSessions && (
                    <button
                      onClick={() => navigate(`/pos/${b.id}/sessions`)}
                      className="btn-secondary text-sm py-2 flex items-center justify-center gap-2"
                    >
                      <Clock size={14} /> Sessions
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
