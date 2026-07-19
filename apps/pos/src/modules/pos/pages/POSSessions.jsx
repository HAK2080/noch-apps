// POSSessions.jsx — Sessions (shifts) list for a branch.
// Route: /pos/:branchId/sessions
//
// A "session" here = one row in pos_shifts: from staff opening the till
// to closing it at end of trading. Because cafes open evenings that cross
// midnight, sessions are the correct unit for "today's sales" (calendar
// dates split a single trading shift in two).
//
// This page is read-only — you open/close shifts from POSHome and
// POSEndOfDay respectively. Click any row for its detailed report
// (the existing POSEndOfDay page handles closed-shift view too).

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, CheckCircle2, AlertTriangle, DollarSign, CreditCard, Bike, Package, Lock } from 'lucide-react'
import { getPOSBranch, listShifts, getShiftRefundTotals, businessToday, businessDayWindow, localYmd } from '../lib/pos-supabase'
import { getServedBy } from '../lib/pos-session'
import { useAuth } from '../../../contexts/AuthContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import Layout from '../../../components/Layout'
import BusinessRangePicker from '../../../components/shared/BusinessRangePicker'
import toast from 'react-hot-toast'

function formatDuration(openedAt, closedAt) {
  if (!openedAt) return '—'
  const end = closedAt ? new Date(closedAt) : new Date()
  const start = new Date(openedAt)
  const mins = Math.max(0, Math.round((end - start) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  // Show date + time so cross-midnight sessions are unambiguous
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

const formatAmount = value => Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatCount = value => Number(value || 0).toLocaleString('en-US')

export default function POSSessions() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { isOwner, hasAccess } = usePermissions()
  // Session/shift totals: 'sales' permission for the logged-in profile, OR a
  // PIN-verified owner/supervisor on a shared terminal (role_permissions keys
  // off the Supabase login, not the PIN operator — keep the role fallback).
  const allowed = isOwner || hasAccess('sales')
    || ['owner', 'supervisor'].includes(getServedBy()?.role)
    || profile?.role === 'supervisor'

  const [branch, setBranch] = useState(null)
  const [shifts, setShifts] = useState([])
  const [refundsByShift, setRefundsByShift] = useState({})
  const [loading, setLoading] = useState(true)

  // Date range (business days, 5 AM → 5 AM). Default: last 30 days.
  const RANGE_PRESETS = [
    { key: 'today', label: 'Today', days: 0 },
    { key: '7d',    label: '7 days', days: 6 },
    { key: '30d',   label: '30 days', days: 29 },
  ]
  const [range, setRange] = useState(() => {
    const to = businessToday()
    const from = businessToday(); from.setDate(from.getDate() - 29)
    return { preset: '30d', fromDate: localYmd(from), toDate: localYmd(to) }
  })
  const choosePreset = (p) => {
    if (p === 'custom') { setRange(r => ({ ...r, preset: 'custom' })); return }
    const meta = RANGE_PRESETS.find(x => x.key === p)
    const to = businessToday()
    const from = businessToday(); from.setDate(from.getDate() - (meta?.days ?? 0))
    setRange({ preset: p, fromDate: localYmd(from), toDate: localYmd(to) })
  }

  const load = async () => {
    if (!allowed) { setLoading(false); return }   // guard: don't even fetch
    setLoading(true)
    try {
      const { fromIso, toIso } = businessDayWindow(range.fromDate, range.toDate)
      const [b, list] = await Promise.all([
        getPOSBranch(branchId),
        listShifts(branchId, { limit: 500, fromIso, toIso }),
      ])
      const refunds = await getShiftRefundTotals(list.map(s => s.id))
      setBranch(b)
      setShifts(list)
      setRefundsByShift(refunds)
    } catch (err) {
      toast.error(err.message || 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [branchId, allowed, range.fromDate, range.toDate])

  // Hard block: staff / limited_staff land here → "Access denied" card.
  if (!allowed) {
    return (
      <Layout>
        <div className="max-w-md mx-auto py-16 text-center">
          <Lock size={36} className="text-noch-muted mx-auto mb-3" />
          <h1 className="text-white font-bold text-lg mb-2">Access restricted</h1>
          <p className="text-noch-muted text-sm mb-5">
            Sessions and shift totals are visible to owners and managers only.
          </p>
          <button onClick={() => navigate(`/pos/${branchId}`)} className="btn-secondary text-sm">
            Back to POS
          </button>
        </div>
      </Layout>
    )
  }

  const refundFor = shift => Number(refundsByShift[shift.id] || 0)

  // Aggregate top-level metrics across all loaded sessions
  const totals = shifts.reduce((a, s) => {
    const refund = refundFor(s)
    a.revenue += Number(s.total_sales) || 0
    a.refunds  += refund
    // Refunds are returned from the cash drawer by the refund workflow.
    a.cash    += (Number(s.total_cash_sales) || 0) - refund
    a.card    += Number(s.total_card_sales) || 0
    a.presto  += Number(s.total_presto_sales) || 0
    a.orders  += Number(s.total_orders) || 0
    return a
  }, { revenue: 0, refunds: 0, cash: 0, card: 0, presto: 0, orders: 0 })
  const paymentTotal = totals.cash + totals.card + totals.presto
  const reconciliationGap = totals.revenue - paymentTotal

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Sessions</h1>
            <p className="text-noch-muted text-sm">{branch?.name} · {range.fromDate} → {range.toDate} · {shifts.length} shifts</p>
          </div>
          <button onClick={load} className="btn-secondary text-sm px-3 py-1">Refresh</button>
        </div>

        {/* Date range (business days: 5 AM → 5 AM, so late-night sales stay with the evening) */}
        <div className="mb-4">
          <BusinessRangePicker presets={RANGE_PRESETS} value={{ preset: range.preset, from: range.fromDate, to: range.toDate }} onChange={next => setRange({ preset: next.preset, fromDate: next.from, toDate: next.to })} />
        </div>
        {/* eslint-disable-next-line no-constant-binary-expression */}
        {false && <div className="flex flex-wrap items-center gap-2 mb-4">
          {RANGE_PRESETS.map(p => (
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

        {/* Top-level totals across the visible window */}
        {!loading && shifts.length > 0 && (
          <div className="card p-4 mb-4">
            <p className="text-noch-muted text-xs mb-2">Across {shifts.length} sessions ({range.fromDate} → {range.toDate})</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Net revenue</p>
                <p className="text-noch-green font-bold text-lg leading-tight">{formatAmount(totals.revenue)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Orders</p>
                <p className="text-white font-bold text-lg leading-tight">{formatCount(totals.orders)}</p>
                <p className="text-noch-muted text-[10px]">tickets</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Cash</p>
                <p className="text-white font-bold text-lg leading-tight">{formatAmount(totals.cash)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Card</p>
                <p className="text-white font-bold text-lg leading-tight">{formatAmount(totals.card)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Presto</p>
                <p className="text-white font-bold text-lg leading-tight">{formatAmount(totals.presto)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Refunds</p>
                <p className="text-red-400 font-bold text-lg leading-tight">-{formatAmount(totals.refunds)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-noch-border/40 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-noch-muted">Payment reconciliation</span>
              {Math.abs(reconciliationGap) < 0.01 ? (
                <span className="text-noch-green flex items-center gap-1"><CheckCircle2 size={13} /> Reconciled · {formatAmount(paymentTotal)} LYD</span>
              ) : (
                <span className="text-yellow-400 flex items-center gap-1"><AlertTriangle size={13} /> Gap {reconciliationGap > 0 ? '+' : ''}{formatAmount(reconciliationGap)} LYD</span>
              )}
            </div>
            <p className="text-noch-muted text-[10px] mt-2">Refunds are deducted from cash because refunds leave the cash drawer.</p>
          </div>
        )}

        {/* Sessions list */}
        {loading ? (
          <p className="text-noch-muted text-center py-12">Loading…</p>
        ) : shifts.length === 0 ? (
          <p className="text-noch-muted text-center py-12 text-sm">No sessions yet for this branch.</p>
        ) : (
          <div className="card divide-y divide-noch-border/40">
            {shifts.map(s => {
              const isOpen = s.status === 'open'
              const refund = refundFor(s)
              const netCash = (Number(s.total_cash_sales) || 0) - refund
              return (
                <div
                  key={s.id}
                  className="py-3 px-3 flex flex-wrap items-center gap-3 cursor-pointer hover:bg-white/[0.02]"
                  onClick={() => navigate(`/pos/${branchId}/end-of-day?shift=${s.id}`)}
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className={isOpen ? 'text-noch-green font-semibold' : 'text-white font-semibold'}>
                        {formatWhen(s.opened_at)}
                      </span>
                      <span className="text-noch-muted text-xs">→</span>
                      {isOpen ? (
                        <span className="bg-noch-green/15 border border-noch-green/30 text-noch-green text-[10px] uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                          <Clock size={10} /> OPEN
                        </span>
                      ) : (
                        <span className="text-white">{formatWhen(s.closed_at)}</span>
                      )}
                    </div>
                    <div className="text-noch-muted text-xs mt-0.5 flex items-center gap-3 flex-wrap">
                      <span><Clock size={10} className="inline mr-1" />{formatDuration(s.opened_at, s.closed_at)}</span>
                      <span><Package size={10} className="inline mr-1" />{s.total_orders || 0} orders</span>
                      {Number(s.cash_difference) !== 0 && !isOpen && (
                        <span className={Number(s.cash_difference) < 0 ? 'text-red-400' : 'text-yellow-400'}>
                          Cash {Number(s.cash_difference) > 0 ? '+' : ''}{formatAmount(s.cash_difference)}
                        </span>
                      )}
                      {refund > 0 && <span className="text-red-400">Refunds -{formatAmount(refund)}</span>}
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs">
                    <div className="text-right">
                      <p className="text-noch-muted text-[10px] uppercase">Cash</p>
                      <p className="text-white font-semibold flex items-center gap-1"><DollarSign size={10} />{formatAmount(netCash)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-noch-muted text-[10px] uppercase">Card</p>
                      <p className="text-white font-semibold flex items-center gap-1"><CreditCard size={10} />{formatAmount(s.total_card_sales)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-noch-muted text-[10px] uppercase">Presto</p>
                      <p className="text-white font-semibold flex items-center gap-1"><Bike size={10} />{formatAmount(s.total_presto_sales)}</p>
                    </div>
                  </div>

                  <div className="text-right min-w-[80px]">
                    <p className="text-noch-muted text-[10px] uppercase">Total</p>
                    <p className="text-noch-green font-bold">{formatAmount(s.total_sales)}</p>
                    <p className="text-noch-muted text-[10px]">LYD</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
