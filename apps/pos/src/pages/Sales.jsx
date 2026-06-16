// Sales.jsx — Branch picker into Orders or Sessions views.
// Route: /sales
//
// Two ways to slice sales data:
//   Orders   — every individual transaction (search, refund, void, reprint)
//   Sessions — group by trading shift (best for cafes that cross midnight)

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Clock, Download, Calendar } from 'lucide-react'
import { getPOSBranches, getSalesExportRows } from '../modules/pos/lib/pos-supabase'
import { getServedBy } from '../modules/pos/lib/pos-session'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import Layout from '../components/Layout'
import { downloadCsv } from '../lib/exportCsv'
import toast from 'react-hot-toast'

function localYmd(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rangeForPreset(preset) {
  const to = new Date()
  const from = new Date()
  if (preset === '7days') from.setDate(from.getDate() - 6)
  if (preset === 'month') from.setDate(1)
  return { fromDate: localYmd(from), toDate: localYmd(to) }
}

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
  const [rangePreset, setRangePreset] = useState('today')
  const [fromDate, setFromDate] = useState(() => rangeForPreset('today').fromDate)
  const [toDate, setToDate] = useState(() => rangeForPreset('today').toDate)
  const [exportBranchId, setExportBranchId] = useState('all')
  const [exporting, setExporting] = useState(false)
  const fromDateInputRef = useRef(null)
  const toDateInputRef = useRef(null)

  useEffect(() => {
    getPOSBranches()
      .then(list => {
        setBranches(list || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const chooseRange = (preset) => {
    setRangePreset(preset)
    if (preset === 'custom') return
    const next = rangeForPreset(preset)
    setFromDate(next.fromDate)
    setToDate(next.toDate)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const effectiveFromDate = rangePreset === 'custom'
        ? fromDateInputRef.current?.value || fromDate
        : fromDate
      const effectiveToDate = rangePreset === 'custom'
        ? toDateInputRef.current?.value || toDate
        : toDate

      if (!effectiveFromDate || !effectiveToDate || effectiveFromDate > effectiveToDate) {
        throw new Error('Choose a valid export date range')
      }

      const selectedBranches = exportBranchId === 'all'
        ? branches
        : branches.filter(b => b.id === exportBranchId)
      const fromIso = new Date(`${effectiveFromDate}T00:00:00`).toISOString()
      const toIso = new Date(`${effectiveToDate}T23:59:59.999`).toISOString()
      const chunks = await Promise.all(
        selectedBranches.map(branch =>
          getSalesExportRows(branch.id, { from: fromIso, to: toIso })
            .then(rows => rows.map(row => ({ branch, row }))),
        ),
      )
      const rows = chunks.flat().map(({ branch, row }) => {
        const order = row.pos_orders || {}
        const created = order.created_at ? new Date(order.created_at) : null
        const qty = Number(row.quantity) || 0
        const unitPrice = Number(row.unit_price) || 0
        const lineTotal = Number(row.total) || qty * unitPrice
        const refundedQty = Number(row.refunded_qty) || 0
        const netQty = Math.max(0, qty - refundedQty)
        const netLineTotal = qty > 0 ? lineTotal * (netQty / qty) : lineTotal
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
          qty,
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
        `sales_detail_${exportBranchId === 'all' ? 'all_branches' : selectedBranches[0]?.name || 'branch'}_${effectiveFromDate}_${effectiveToDate}`,
        [
          'timestamp', 'date', 'hour', 'branch', 'order_number', 'order_status', 'source',
          'payment_method', 'customer_name', 'customer_phone', 'table_number', 'pickup_code',
          'served_by', 'product_id', 'product_name', 'product_name_ar', 'quantity',
          'refunded_qty', 'net_quantity', 'unit_price_lyd', 'line_total_lyd',
          'net_line_total_lyd', 'order_subtotal_lyd', 'order_discount_lyd',
          'order_discount_pct', 'order_total_lyd', 'shift_id', 'line_notes',
        ],
        rows,
      )
      toast.success(`Exported ${rows.length} sale lines`)
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
        <p className="text-noch-muted text-sm mb-6">View orders or trading sessions for each branch</p>

        <div className="card p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                <Download size={15} className="text-noch-green" /> Export detailed sales
              </h2>
              <p className="text-noch-muted text-xs mt-1">One CSV row per sold item, ready for sales and trend analysis.</p>
            </div>
            <button onClick={handleExport} disabled={exporting || branches.length === 0} className="btn-primary text-sm px-3 py-2 flex items-center justify-center gap-2">
              <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3">
            {[
              ['today', 'Today'],
              ['7days', '7 days'],
              ['month', 'This month'],
              ['custom', 'Custom'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => chooseRange(key)}
                className={`py-2 rounded-lg text-sm border ${rangePreset === key ? 'bg-noch-green/10 border-noch-green/50 text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
              >
                {label}
              </button>
            ))}
            <select value={exportBranchId} onChange={e => setExportBranchId(e.target.value)} className="input text-sm">
              <option value="all">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <p className="text-noch-muted text-xs mb-3">
            Exporting {fromDate} to {toDate}
          </p>
          {rangePreset === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-noch-muted">
                <span className="flex items-center gap-1 mb-1"><Calendar size={12} /> From</span>
                <input ref={fromDateInputRef} type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} className="input text-sm" />
              </label>
              <label className="text-xs text-noch-muted">
                <span className="flex items-center gap-1 mb-1"><Calendar size={12} /> To</span>
                <input ref={toDateInputRef} type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} className="input text-sm" />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {branches.map(b => (
            <div key={b.id} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-white font-semibold">{b.name}</p>
                  {b.address && <p className="text-noch-muted text-sm mt-0.5">{b.address}</p>}
                </div>
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
          ))}
        </div>
      </div>
    </Layout>
  )
}
