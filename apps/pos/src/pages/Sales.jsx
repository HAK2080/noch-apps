// Sales.jsx — Sales overview: real totals per branch + range presets,
// then drill into Orders or Sessions views.
// Route: /sales
//
// Figures come from the pos_sales_daily view, which buckets by BUSINESS day
// (5 AM → 5 AM Africa/Tripoli) so post-midnight sales count toward the
// evening's trading day.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Clock, TrendingUp } from 'lucide-react'
import {
  getPOSBranches, getDailySalesRange, businessToday, localYmd,
} from '../modules/pos/lib/pos-supabase'
import { getServedBy } from '../modules/pos/lib/pos-session'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import Layout from '../components/Layout'
import BusinessRangePicker from '../components/shared/BusinessRangePicker'

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
