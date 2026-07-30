// DailyPnLTab.jsx — headline screen of the Finance module.
// Pulls finance_pnl(branch, from, to) and finance_settings.
// Renders 8 KPI cards with target-band threshold colours.

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import PeriodSelector from '../components/PeriodSelector'
import KPICard from '../components/KPICard'
import FinanceBreakdownModal from '../components/FinanceBreakdownModal'
import { businessToday } from '../../../lib/businessDay'
import { getPnL, getFinanceSettings, listBranches, listProductsMissingCost } from '../lib/finance-supabase'
import { STATUS, statusForRatio, lyd, pct } from '../lib/thresholds'
import { downloadCsv, ExportButtons } from '../../../lib/exportCsv'
import toast from 'react-hot-toast'

// Seed a default 7-day period synchronously so the data-fetch effect can
// fire on first render. Previously `period` defaulted to null and was only
// set when `<PeriodSelector>` mounted — but the component was returning
// "Loading…" before reaching the JSX that mounts PeriodSelector, leaving
// /finance hung forever.
function defaultPeriod() {
  // Business days (5 AM → 5 AM): before 5 AM, "today" is still the evening's trading day
  const to = businessToday(); to.setHours(23, 59, 59, 999)
  const from = businessToday(); from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - 6)
  // Local date, not UTC — toISOString() shifted dates a day back (Libya UTC+2)
  const ymd = (d) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
  return { preset: '7d', from: ymd(from), to: ymd(to) }
}

export default function DailyPnLTab() {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(null) // null = all
  const [period, setPeriod] = useState(defaultPeriod)
  const [netOfRefunds, setNetOfRefunds] = useState(true)
  const [pnl, setPnl] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [missingCosts, setMissingCosts] = useState([])
  const [breakdown, setBreakdown] = useState(null) // 'prime' | 'revenue' | 'cogs' | 'labor' | 'opex' | 'net'

  useEffect(() => {
    Promise.all([listBranches(), getFinanceSettings()])
      .then(([bs, s]) => { setBranches(bs); setSettings(s) })
      .catch(err => toast.error(err.message || 'Failed to load setup'))
  }, [])

  useEffect(() => {
    listProductsMissingCost(branchId)
      .then(setMissingCosts)
      .catch(err => toast.error(err.message || 'Failed to check product costs'))
  }, [branchId])

  const [loadError, setLoadError] = useState(null)
  useEffect(() => {
    if (!period) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setLoadError(null)
    // 12-second timeout so /finance never hangs forever if the RPC
    // is slow on the server.
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timed out fetching P&L (server slow)')), 12000)
    )
    Promise.race([
      getPnL({ branchId, from: period.from, to: period.to, netOfRefunds }),
      timeoutPromise,
    ])
      .then(d => { if (!cancelled) setPnl(d) })
      .catch(err => {
        if (!cancelled) {
          setLoadError(err.message || 'Failed to load P&L')
          toast.error(err.message || 'Failed to load P&L')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, period?.from, period?.to, netOfRefunds])

  const k = useMemo(() => {
    if (!pnl) return null
    const rev = Number(pnl.revenue_net || 0)
    const cogs = Number(pnl.cogs || 0)
    const laborTotal = Number(pnl.labor || 0)
    const labor = Number(pnl.labor_direct ?? laborTotal)
    const opexTotal = Number(pnl.opex || 0)
    const opex = Number(pnl.opex_direct ?? opexTotal)
    const shared = Number(pnl.shared_costs_allocated || 0)
    const prime = Number(pnl.prime_cost || 0)
    const net = Number(pnl.net_contribution || 0)
    const netBeforeShared = Number(pnl.net_contribution_before_shared ?? (rev - cogs - labor - opex))
    const cogsR  = rev > 0 ? cogs / rev   : null
    const laborR = rev > 0 ? labor / rev  : null
    const primeR = rev > 0 ? prime / rev  : null
    const netR   = rev > 0 ? net / rev    : null
    const grossR = rev > 0 ? (rev - cogs) / rev : null
    return { rev, cogs, labor, laborTotal, opex, opexTotal, shared, prime, net, netBeforeShared, cogsR, laborR, primeR, netR, grossR, orders: pnl.orders }
  }, [pnl])

  if (loadError && !pnl) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-300 text-sm font-semibold mb-1">Could not load P&L</p>
        <p className="text-red-300/80 text-xs">{loadError}</p>
        <p className="text-noch-muted text-xs mt-3">
          The other tabs may still work. If this persists, the <code>finance_pnl</code> RPC
          may be slow on a large `pos_orders` history; consider adding indexes on
          <code>(branch_id, created_at, status)</code>.
        </p>
      </div>
    )
  }
  if (loading || !pnl || !settings) {
    return <p className="text-noch-muted text-center py-12">Loading…</p>
  }

  const cogsStat  = statusForRatio(k.cogsR,  Number(settings.food_cost_min_pct),  Number(settings.food_cost_max_pct))
  const laborStat = statusForRatio(k.laborR, Number(settings.labor_cost_min_pct), Number(settings.labor_cost_max_pct))
  const primeStat = statusForRatio(k.primeR, Number(settings.prime_cost_min_pct), Number(settings.prime_cost_max_pct))

  return (
    <div className="flex flex-col gap-4">
      {/* Period + branch */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={branchId || ''}
            onChange={e => setBranchId(e.target.value || null)}
            className="input py-1 px-2 text-xs"
          >
            <option value="">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <PeriodSelector value={period} onChange={setPeriod} />
          <label className="flex items-center gap-1.5 text-xs text-noch-muted cursor-pointer">
            <input type="checkbox" checked={netOfRefunds} onChange={e => setNetOfRefunds(e.target.checked)} />
            Net of refunds
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-noch-muted text-xs flex items-center gap-1">
            <TrendingUp size={12} /> {k.orders} orders
          </div>
          <ExportButtons onCsv={() => downloadCsv(`pnl_${period.from}_${period.to}`,
            ['Line', 'LYD', '% of revenue'],
            [
              ['Revenue (net)', k.rev.toFixed(2), ''],
              ['Discounts', Number(pnl.discounts || 0).toFixed(2), ''],
              ['Refunds', Number(pnl.refunds || 0).toFixed(2), ''],
              ['COGS', k.cogs.toFixed(2), k.cogsR != null ? (k.cogsR * 100).toFixed(1) + '%' : ''],
              ['Direct labor', k.labor.toFixed(2), k.laborR != null ? (k.laborR * 100).toFixed(1) + '%' : ''],
              ['Prime cost', k.prime.toFixed(2), k.primeR != null ? (k.primeR * 100).toFixed(1) + '%' : ''],
              ['Direct OpEx', k.opex.toFixed(2), ''],
              ['Shared costs allocated', k.shared.toFixed(2), ''],
              ['Contribution before shared', k.netBeforeShared.toFixed(2), ''],
              ['Fully loaded profit', k.net.toFixed(2), k.netR != null ? (k.netR * 100).toFixed(1) + '%' : ''],
              ['Orders', k.orders, ''],
              ['Period', `${period.from} to ${period.to}`, ''],
              ['Branch', branchId ? (branches.find(b => b.id === branchId)?.name || branchId) : 'All branches', ''],
            ])} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Prime Cost"
          value={pct(k.primeR, 1)}
          ratio={k.primeR}
          status={primeStat}
          bandLabel={`Target ${settings.prime_cost_min_pct}–${settings.prime_cost_max_pct}%`}
          sub={lyd(k.prime)}
          onClick={() => setBreakdown('prime')}
          emphasis
        />
        <KPICard
          label="Revenue (net)"
          value={lyd(k.rev)}
          status={STATUS.NEUTRAL}
          sub={`-${lyd(pnl.discounts || 0)} disc`}
          onClick={() => setBreakdown('revenue')}
        />
        <KPICard
          label="COGS"
          value={pct(k.cogsR, 1)}
          ratio={k.cogsR}
          status={cogsStat}
          bandLabel={`Target ${settings.food_cost_min_pct}–${settings.food_cost_max_pct}%`}
          sub={lyd(k.cogs)}
          onClick={() => setBreakdown('cogs')}
        />
        <KPICard
          label="Direct Labor"
          value={pct(k.laborR, 1)}
          ratio={k.laborR}
          status={laborStat}
          bandLabel={`Target ${settings.labor_cost_min_pct}–${settings.labor_cost_max_pct}%`}
          sub={lyd(k.labor)}
          onClick={() => setBreakdown('labor')}
        />
        <KPICard label="Direct OpEx" value={lyd(k.opex)} onClick={() => setBreakdown('opex')} />
        <KPICard label="Shared costs allocated" value={lyd(k.shared)} sub="Included in fully loaded profit" />
        <KPICard label="Contribution before shared" value={lyd(k.netBeforeShared)} onClick={() => setBreakdown('net')} />
        <KPICard label="Fully loaded profit" value={lyd(k.net)} sub={pct(k.netR, 1)} onClick={() => setBreakdown('net')} />
        <KPICard label="Gross margin" value={pct(k.grossR, 1)} />
        <KPICard
          label="Avg ticket"
          value={k.orders ? lyd(k.rev / k.orders) : '—'}
        />
      </div>

      {/* Hint when COGS is zero (means no recipe links) */}
      {missingCosts.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-yellow-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">{missingCosts.length} active product{missingCosts.length === 1 ? '' : 's'} missing cost</p>
              <p className="text-xs text-yellow-200/80 mt-1">COGS and margin are understated until these are completed in Cost mapping.</p>
              <p className="text-xs mt-2 text-white">{missingCosts.slice(0, 8).map(product => product.name || product.name_ar).join(', ')}{missingCosts.length > 8 ? `, +${missingCosts.length - 8} more` : ''}</p>
            </div>
          </div>
        </div>
      )}
      {k.rev > 0 && k.cogs === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-yellow-300 text-sm">
          COGS is 0 — set per-product cost in the <strong>Cost mapping</strong> tab so the Menu Profitability Matrix and Prime Cost reflect reality.
        </div>
      )}
      {/* Hint when labor is zero */}
      {k.rev > 0 && k.labor === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-yellow-300 text-sm">
          Labor cost is 0 — set hourly rates on staff and clock attendees in/out via the <strong>Shifts</strong> tab.
        </div>
      )}
      {breakdown && (
        <FinanceBreakdownModal
          kind={breakdown}
          branchId={branchId}
          branchName={branchId ? branches.find(b => b.id === branchId)?.name || null : null}
          from={period.from}
          to={period.to}
          netOfRefunds={netOfRefunds}
          settings={settings}
          onClose={() => setBreakdown(null)}
        />
      )}
    </div>
  )
}
