import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import PeriodSelector from '../components/PeriodSelector'
import FinanceBreakdownModal from '../components/FinanceBreakdownModal'
import { getExecutiveSummary, getLiquiditySummary } from '../lib/finance-supabase'
import { completedExecutivePeriod } from '../../reports/lib/reporting-periods'
import { lyd, pct } from '../lib/thresholds'
import toast from 'react-hot-toast'

function defaultPeriod() {
  return completedExecutivePeriod('7d')
}

function shortDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : 'not set'
}

const STATUS = {
  healthy: { label: 'Healthy', className: 'text-noch-green bg-noch-green/10 border-noch-green/30' },
  watch: { label: 'Watch', className: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' },
  at_risk: { label: 'At risk', className: 'text-red-300 bg-red-500/10 border-red-500/30' },
  no_data: { label: 'No data', className: 'text-noch-muted bg-noch-card border-noch-border' },
  pre_opening: { label: 'Pre-opening', className: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
}

export default function ExecutiveSummaryTab() {
  const [period, setPeriod] = useState(defaultPeriod)
  const [netOfRefunds, setNetOfRefunds] = useState(true)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [breakdown, setBreakdown] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [health, liquidity] = await Promise.all([
        getExecutiveSummary({ from: period.from, to: period.to, netOfRefunds }),
        getLiquiditySummary(),
      ])
      setSummary({ ...health, liquidity })
    } catch (error) {
      toast.error(error.message || 'Failed to load executive summary')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.from, period.to, netOfRefunds])

  if (loading && !summary) {
    return <p className="text-noch-muted text-center py-12">Loading…</p>
  }

  const total = summary?.total
  const settings = summary?.settings || {}
  const liquidity = summary?.liquidity || {}
  const rows = summary?.branches || []
  const reconciliation = summary?.reconciliation
  const dataQuality = total?.dataQuality || {}
  const statusCounts = rows.reduce((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] || 0) + 1
    return accumulator
  }, {})
  const attentionRows = rows.filter(row => !['healthy', 'pre_opening'].includes(row.status))
  const hasCompletenessIssue = Number(dataQuality.missing_product_cost_count || 0) > 0
    || Number(dataQuality.unallocated_expense_count || 0) > 0
    || reconciliation?.status === 'warning'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-white font-semibold">Business health by branch</p>
          <p className="text-noch-muted text-xs mt-0.5">
            Prime cost target {settings.prime_cost_min_pct ?? 55}–{settings.prime_cost_max_pct ?? 65}%
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector
            value={period}
            onChange={setPeriod}
            labels={{ today: 'Today', '7d': 'Weekly', '30d': 'Monthly', '90d': '90 days' }}
            rangeOverrides={{
              '7d': completedExecutivePeriod('7d'),
              '30d': completedExecutivePeriod('30d'),
              '90d': completedExecutivePeriod('90d'),
            }}
          />
          <label className="flex items-center gap-1.5 text-xs text-noch-muted cursor-pointer">
            <input
              type="checkbox"
              checked={netOfRefunds}
              onChange={event => setNetOfRefunds(event.target.checked)}
            />
            Net of refunds
          </label>
          <button onClick={load} className="btn-secondary p-2" title="Refresh" aria-label="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-noch-card border border-noch-border rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="text-white font-semibold">Data trust</span>
        <span className="text-noch-muted">
          Refreshed: <b className="text-white">{summary?.generatedAt ? new Date(summary.generatedAt).toLocaleString('en-GB') : 'not available'}</b>
        </span>
        <span className={reconciliation?.status === 'reconciled' ? 'text-noch-green' : 'text-yellow-300'}>
          Branch reconciliation: {reconciliation?.status === 'reconciled' ? 'reconciled' : 'review differences'}
        </span>
        <span className="text-noch-muted">
          Cash counted: <b className="text-white">{shortDate(liquidity.cashUpdatedAt)}</b>
        </span>
        <span className="text-noch-muted">
          Bank as of: <b className="text-white">{shortDate(liquidity.bankUpdatedAt)}</b>
        </span>
        <span className="text-yellow-300">Bank reconciliation: not available</span>
      </div>

      {hasCompletenessIssue && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 text-yellow-300 text-xs font-semibold mb-2">
            <TriangleAlert size={14} /> Report completeness
          </div>
          <div className="space-y-1 text-noch-muted text-xs">
            {Number(dataQuality.missing_product_cost_count || 0) > 0 && (
              <p>{dataQuality.missing_product_cost_count} sold product(s) have no cost; COGS and profit are understated.</p>
            )}
            {Number(dataQuality.unallocated_expense_count || 0) > 0 && (
              <p>{dataQuality.unallocated_expense_count} approved expense(s) are consolidated-only until assigned to a cost center.</p>
            )}
            {reconciliation?.material?.map(row => (
              <p key={row.id}>
                {row.id}: consolidated {lyd(row.consolidated)} vs branch total {lyd(row.branchTotal)}; difference {lyd(row.delta)}.
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stream title="Operating performance">
          <Metric
            label="Net sales"
            value={lyd(total?.revenue)}
            onClick={() => setBreakdown({ kind: 'revenue', branchId: null, branchName: null })}
          />
          <Metric
            label="Product costs (COGS)"
            value={lyd(total?.cogs)}
            onClick={() => setBreakdown({ kind: 'cogs', branchId: null, branchName: null })}
          />
          <Metric
            label="Fully loaded operating profit"
            value={lyd(total?.net)}
            onClick={() => setBreakdown({ kind: 'net', branchId: null, branchName: null })}
          />
          <Metric
            label="Products + staff"
            value={pct(total?.primeRatio)}
            onClick={() => setBreakdown({ kind: 'prime', branchId: null, branchName: null })}
          />
        </Stream>
        <Stream title="Cash available">
          <Metric label="Cash on hand" value={lyd(liquidity.cashOnHand)} />
          <Metric
            label="Bank balance"
            value={liquidity.bankBalance == null ? 'Not imported' : lyd(liquidity.bankBalance)}
          />
          <Metric
            label="Total available cash"
            value={liquidity.totalLiquidity == null ? '—' : lyd(liquidity.totalLiquidity)}
          />
          <Metric
            label="Weeks of cash left"
            value={liquidity.runwayWeeks == null ? '—' : `${liquidity.runwayWeeks.toFixed(1)} weeks`}
          />
        </Stream>
        <Stream title="What needs attention">
          <Metric label="Branches to review" value={`${attentionRows.length} / ${rows.length}`} />
          <Metric
            label="Prime cost target"
            value={`${settings.prime_cost_min_pct ?? 55}–${settings.prime_cost_max_pct ?? 65}%`}
          />
          <Metric label="30d fixed outflows" value={lyd(liquidity.upcoming30dOutflows)} />
        </Stream>
      </div>

      <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-noch-border flex items-center justify-between">
          <p className="text-white text-sm font-semibold">Branch status</p>
          <p className="text-noch-muted text-xs">
            {statusCounts.healthy || 0} healthy · {statusCounts.pre_opening || 0} pre-opening · {(statusCounts.watch || 0) + (statusCounts.at_risk || 0)} to review
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-noch-muted text-[10px] uppercase tracking-wide border-b border-noch-border">
                <th className="px-4 py-2.5 font-medium">Branch</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Net sales</th>
                <th className="px-4 py-2.5 font-medium text-right">Product costs</th>
                <th className="px-4 py-2.5 font-medium text-right">Products + staff</th>
                <th className="px-4 py-2.5 font-medium text-right">Operating costs</th>
                <th className="px-4 py-2.5 font-medium text-right">Fully loaded operating profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <BranchRow
                  key={row.id}
                  row={row}
                  onBreakdown={kind => setBreakdown({ kind, branchId: row.id, branchName: row.name })}
                />
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="text-noch-muted text-center py-8 text-sm">No active branches found.</p>
        )}
      </div>

      {attentionRows.length > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 text-yellow-300 text-xs font-semibold mb-2">
            <TriangleAlert size={14} /> Review before acting
          </div>
          <div className="space-y-1">
            {attentionRows.map(row => (
              <p key={row.id} className="text-noch-muted text-xs">
                <span className="text-white">{row.name}:</span> {row.reasons.join(' · ') || (row.status === 'at_risk'
                  ? 'Prime cost or operating profit is outside target.'
                  : 'Prime cost is near target limit.')}
              </p>
            ))}
          </div>
        </div>
      )}

      {breakdown && (
        <FinanceBreakdownModal
          kind={breakdown.kind}
          branchId={breakdown.branchId}
          branchName={breakdown.branchName}
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

function Metric({ label, value, onClick }) {
  return (
    <div
      className={`bg-noch-card border border-noch-border rounded-xl p-3 ${onClick ? 'cursor-pointer hover:border-noch-green/50 transition-colors' : ''}`}
      onClick={onClick}
    >
      <p className="text-noch-muted text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-white font-bold text-lg mt-1">{value || '—'}</p>
    </div>
  )
}

function Stream({ title, children }) {
  return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-3">
      <p className="text-white text-sm font-semibold mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  )
}

function BranchRow({ row, onBreakdown }) {
  const status = STATUS[row.status] || STATUS.no_data
  const cellButton = (kind, label, title, extraClass = 'text-white') => (
    <button
      onClick={() => onBreakdown(kind)}
      className={`cursor-pointer hover:text-noch-green hover:underline underline-offset-4 ${extraClass}`}
      title={title}
    >
      {label}
    </button>
  )
  const netClass = row.status === 'pre_opening'
    ? 'text-noch-muted'
    : row.net < 0
      ? 'text-red-300'
      : 'text-white'

  return (
    <tr className="border-b border-noch-border/70 last:border-0">
      <td className="px-4 py-3 text-white font-medium">{row.name}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-semibold ${status.className}`}>
          {row.status === 'healthy'
            ? <ShieldCheck size={12} />
            : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
          {status.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-white font-mono">
        {cellButton('revenue', lyd(row.revenue), 'View net sales breakdown')}
      </td>
      <td className="px-4 py-3 text-right text-white font-mono">
        {cellButton('cogs', lyd(row.cogs), 'View COGS breakdown')}
      </td>
      <td className="px-4 py-3 text-right text-white font-mono">
        {cellButton('prime', pct(row.primeRatio), 'View prime cost breakdown')}
      </td>
      <td className="px-4 py-3 text-right text-white font-mono">{lyd(row.opexTotal)}</td>
      <td className="px-4 py-3 text-right font-mono">
        {row.status === 'pre_opening'
          ? <span className="text-noch-muted">—</span>
          : cellButton('net', lyd(row.net), 'View operating profit breakdown', netClass)}
      </td>
    </tr>
  )
}
