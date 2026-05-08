// DailyPnLTab.jsx — headline screen of the Finance module.
// Pulls finance_pnl(branch, from, to) and finance_settings.
// Renders 8 KPI cards with target-band threshold colours.

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import PeriodSelector from '../components/PeriodSelector'
import KPICard from '../components/KPICard'
import { getPnL, getFinanceSettings, listBranches } from '../lib/finance-supabase'
import { STATUS, statusForRatio, lyd, pct } from '../lib/thresholds'
import toast from 'react-hot-toast'

export default function DailyPnLTab() {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(null) // null = all
  const [period, setPeriod] = useState(null)
  const [pnl, setPnl] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listBranches(), getFinanceSettings()])
      .then(([bs, s]) => { setBranches(bs); setSettings(s) })
      .catch(err => toast.error(err.message || 'Failed to load setup'))
  }, [])

  useEffect(() => {
    if (!period) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getPnL({ branchId, from: period.from, to: period.to })
      .then(d => { if (!cancelled) setPnl(d) })
      .catch(err => { if (!cancelled) toast.error(err.message || 'Failed to load P&L') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [branchId, period?.from, period?.to])

  const k = useMemo(() => {
    if (!pnl) return null
    const rev = Number(pnl.revenue_net || 0)
    const cogs = Number(pnl.cogs || 0)
    const labor = Number(pnl.labor || 0)
    const opex = Number(pnl.opex || 0)
    const prime = Number(pnl.prime_cost || 0)
    const net = Number(pnl.net_contribution || 0)
    const cogsR  = rev > 0 ? cogs / rev   : null
    const laborR = rev > 0 ? labor / rev  : null
    const primeR = rev > 0 ? prime / rev  : null
    const netR   = rev > 0 ? net / rev    : null
    const grossR = rev > 0 ? (rev - cogs) / rev : null
    return { rev, cogs, labor, opex, prime, net, cogsR, laborR, primeR, netR, grossR, orders: pnl.orders }
  }, [pnl])

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
        </div>
        <div className="text-noch-muted text-xs flex items-center gap-1">
          <TrendingUp size={12} /> {k.orders} orders
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
          emphasis
        />
        <KPICard
          label="Revenue (net)"
          value={lyd(k.rev)}
          status={STATUS.NEUTRAL}
          sub={`-${lyd(pnl.discounts || 0)} disc`}
        />
        <KPICard
          label="COGS"
          value={pct(k.cogsR, 1)}
          ratio={k.cogsR}
          status={cogsStat}
          bandLabel={`Target ${settings.food_cost_min_pct}–${settings.food_cost_max_pct}%`}
          sub={lyd(k.cogs)}
        />
        <KPICard
          label="Labor"
          value={pct(k.laborR, 1)}
          ratio={k.laborR}
          status={laborStat}
          bandLabel={`Target ${settings.labor_cost_min_pct}–${settings.labor_cost_max_pct}%`}
          sub={lyd(k.labor)}
        />
        <KPICard label="Other OpEx" value={lyd(k.opex)} />
        <KPICard label="Net contribution" value={lyd(k.net)} sub={pct(k.netR, 1)} />
        <KPICard label="Gross margin" value={pct(k.grossR, 1)} />
        <KPICard
          label="Avg ticket"
          value={k.orders ? lyd(k.rev / k.orders) : '—'}
        />
      </div>

      {/* Hint when COGS is zero (means no recipe links) */}
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
    </div>
  )
}
