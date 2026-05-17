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
import { ArrowLeft, Clock, CheckCircle2, DollarSign, CreditCard, Bike, Package, Lock } from 'lucide-react'
import { getPOSBranch, listShifts } from '../lib/pos-supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

// Roles allowed to view session/shift totals.
// Aligned with POSOrders.jsx — staff and limited_staff are scoped to
// per-order detail only; aggregate financial views are owner+supervisor.
const SESSION_ROLES = ['owner', 'supervisor']

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

export default function POSSessions() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const allowed = SESSION_ROLES.includes(profile?.role)

  const [branch, setBranch] = useState(null)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!allowed) { setLoading(false); return }   // guard: don't even fetch
    setLoading(true)
    try {
      const [b, list] = await Promise.all([
        getPOSBranch(branchId),
        listShifts(branchId, { limit: 60 }),
      ])
      setBranch(b)
      setShifts(list)
    } catch (err) {
      toast.error(err.message || 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [branchId, allowed])

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

  // Aggregate top-level metrics across all loaded sessions
  const totals = shifts.reduce((a, s) => {
    a.revenue += Number(s.total_sales) || 0
    a.cash    += Number(s.total_cash_sales) || 0
    a.card    += Number(s.total_card_sales) || 0
    a.presto  += Number(s.total_presto_sales) || 0
    a.orders  += Number(s.total_orders) || 0
    return a
  }, { revenue: 0, cash: 0, card: 0, presto: 0, orders: 0 })

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
            <p className="text-noch-muted text-sm">{branch?.name} · last {shifts.length} shifts</p>
          </div>
          <button onClick={load} className="btn-secondary text-sm px-3 py-1">Refresh</button>
        </div>

        {/* Top-level totals across the visible window */}
        {!loading && shifts.length > 0 && (
          <div className="card p-4 mb-4">
            <p className="text-noch-muted text-xs mb-2">Across the last {shifts.length} sessions</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Revenue</p>
                <p className="text-noch-green font-bold text-lg leading-tight">{totals.revenue.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Orders</p>
                <p className="text-white font-bold text-lg leading-tight">{totals.orders}</p>
                <p className="text-noch-muted text-[10px]">tickets</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Cash</p>
                <p className="text-white font-bold text-lg leading-tight">{totals.cash.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Card</p>
                <p className="text-white font-bold text-lg leading-tight">{totals.card.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Presto</p>
                <p className="text-white font-bold text-lg leading-tight">{totals.presto.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
            </div>
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
                          Cash {Number(s.cash_difference) > 0 ? '+' : ''}{Number(s.cash_difference).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs">
                    <div className="text-right">
                      <p className="text-noch-muted text-[10px] uppercase">Cash</p>
                      <p className="text-white font-semibold flex items-center gap-1"><DollarSign size={10} />{Number(s.total_cash_sales || 0).toFixed(0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-noch-muted text-[10px] uppercase">Card</p>
                      <p className="text-white font-semibold flex items-center gap-1"><CreditCard size={10} />{Number(s.total_card_sales || 0).toFixed(0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-noch-muted text-[10px] uppercase">Presto</p>
                      <p className="text-white font-semibold flex items-center gap-1"><Bike size={10} />{Number(s.total_presto_sales || 0).toFixed(0)}</p>
                    </div>
                  </div>

                  <div className="text-right min-w-[80px]">
                    <p className="text-noch-muted text-[10px] uppercase">Total</p>
                    <p className="text-noch-green font-bold">{Number(s.total_sales || 0).toFixed(2)}</p>
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
