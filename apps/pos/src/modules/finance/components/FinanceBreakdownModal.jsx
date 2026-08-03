import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMenuMatrix, getOpexBreakdown, getPnL } from '../lib/finance-supabase'
import { lyd, pct, statusForRatio, STATUS_CLASS } from '../lib/thresholds'

// Drill-down for the executive summary and daily P&L metrics. Scoped to a
// period and, optionally, one branch. All kinds read finance_pnl; 'cogs' and
// 'revenue' also read finance_menu_matrix for the per-product table, and
// 'opex' reads the expenses table for the per-category table. The matrix only
// covers base products (no modifiers, discounts, or refunds), so its total
// is reconciled against the P&L figure rather than assumed equal.
const TITLES = {
  cogs: 'Product cost breakdown',
  revenue: 'Sales breakdown',
  net: 'Operating profit breakdown',
  prime: 'Products + staff breakdown',
  labor: 'Staff cost breakdown',
  opex: 'Branch running cost breakdown',
}

const NEEDS_MATRIX = { cogs: true, revenue: true }

export default function FinanceBreakdownModal({ kind, branchId = null, branchName = null, from, to, netOfRefunds = false, settings = {}, onClose }) {
  const [pnl, setPnl] = useState(null)
  const [matrix, setMatrix] = useState(null)
  const [opexRows, setOpexRows] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [pnlData, matrixData, opexData] = await Promise.all([
          getPnL({ branchId, from, to, netOfRefunds }),
          NEEDS_MATRIX[kind] ? getMenuMatrix({ branchId, from, to }) : Promise.resolve(null),
          kind === 'opex' ? getOpexBreakdown({ branchId, from, to }) : Promise.resolve(null),
        ])
        if (cancelled) return
        setPnl(pnlData)
        setMatrix(matrixData)
        setOpexRows(opexData)
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || 'Failed to load breakdown')
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [kind, branchId, from, to, netOfRefunds]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-2xl p-5 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-bold">{TITLES[kind] || 'Breakdown'}</h3>
            <p className="text-noch-muted text-xs mt-0.5">
              {branchName || 'All branches'} · {from} → {to}
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary p-1.5" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <p className="text-noch-muted text-center py-12">Loading…</p>
        ) : kind === 'cogs' ? (
          <CogsSection pnl={pnl} matrix={matrix} branchName={branchName} />
        ) : kind === 'revenue' ? (
          <RevenueSection pnl={pnl} matrix={matrix} netOfRefunds={netOfRefunds} />
        ) : kind === 'net' ? (
          <NetSection pnl={pnl} isCompanyScope={!branchId} />
        ) : kind === 'labor' ? (
          <LaborSection pnl={pnl} />
        ) : kind === 'opex' ? (
          <OpexSection pnl={pnl} rows={opexRows} />
        ) : (
          <PrimeSection pnl={pnl} settings={settings} />
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-3">
      <p className="text-noch-muted text-[10px] uppercase tracking-wide">{label}</p>
      <p className={`${valueClass} font-bold mt-1`}>{value}</p>
    </div>
  )
}

function EmptyState({ children }) {
  return <p className="text-noch-muted text-center py-12 text-sm">{children}</p>
}

function CogsSection({ pnl, matrix, branchName }) {
  const cogs = Number(pnl?.cogs || 0)
  const cogsBase = Number(pnl?.cogs_base || 0)
  const cogsModifiers = Number(pnl?.cogs_modifiers || 0)
  const items = (matrix || [])
    .map(row => ({
      name: row.product_name,
      units: Number(row.units_sold || 0),
      unitCost: Number(row.unit_cost || 0),
      totalCogs: Number(row.units_sold || 0) * Number(row.unit_cost || 0),
    }))
    .sort((a, b) => b.totalCogs - a.totalCogs)
  const matrixTotal = items.reduce((sum, row) => sum + row.totalCogs, 0)
  const totalUnits = items.reduce((sum, row) => sum + row.units, 0)
  const differs = Math.abs(matrixTotal - cogs) > 0.01

  if (items.length === 0 && cogs === 0) return <EmptyState>No COGS data for this period.</EmptyState>

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Base products" value={lyd(cogsBase)} />
        <StatCard label="Modifiers" value={lyd(cogsModifiers)} />
        <StatCard label="Total COGS" value={lyd(cogs)} valueClass="text-noch-green" />
      </div>

      <div className="border border-noch-border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-noch-card">
              <tr className="text-left text-noch-muted text-[10px] uppercase tracking-wide border-b border-noch-border">
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium text-right">Units</th>
                <th className="px-4 py-2.5 font-medium text-right">Unit cost</th>
                <th className="px-4 py-2.5 font-medium text-right">Total COGS</th>
                <th className="px-4 py-2.5 font-medium text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={`${row.name}-${i}`} className="border-b border-noch-border/70 last:border-0">
                  <td className="px-4 py-2.5 text-white">{row.name}</td>
                  <td className="px-4 py-2.5 text-right text-white font-mono">{row.units}</td>
                  <td className="px-4 py-2.5 text-right text-white font-mono">{lyd(row.unitCost)}</td>
                  <td className="px-4 py-2.5 text-right text-white font-mono">{lyd(row.totalCogs)}</td>
                  <td className="px-4 py-2.5 text-right text-noch-muted font-mono">
                    {matrixTotal > 0 ? pct(row.totalCogs / matrixTotal) : '—'}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-noch-muted text-sm">
                    No per-product sales for this period.
                  </td>
                </tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t border-noch-border text-white font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono">{totalUnits}</td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-right font-mono">{lyd(matrixTotal)}</td>
                  <td className="px-4 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {differs && (
        <p className="text-noch-muted text-xs mt-3">
          Per-product total <b className="text-white">{lyd(matrixTotal)}</b> vs P&L COGS <b className="text-white">{lyd(cogs)}</b> — the
          difference is modifier COGS ({lyd(cogsModifiers)}), which the per-product table does not break out.
        </p>
      )}
      <p className="text-noch-muted text-[11px] mt-2">
        COGS uses current product costs (cost_lyd) — editing a cost rewrites history.
        {branchName ? ` Branch: ${branchName}.` : ''}
      </p>
    </>
  )
}

function RevenueSection({ pnl, matrix, netOfRefunds }) {
  const revenueNet = Number(pnl?.revenue_net || 0)
  const discounts = Number(pnl?.discounts || 0)
  const refunds = Number(pnl?.refunds || 0)
  const orders = Number(pnl?.orders || 0)
  // P&L net revenue adds discounts back, and refunds too when they were netted out
  const gross = revenueNet + discounts + (netOfRefunds ? refunds : 0)
  const items = (matrix || [])
    .map(row => ({
      name: row.product_name,
      units: Number(row.units_sold || 0),
      unitPrice: Number(row.unit_price || 0),
      revenue: Number(row.revenue || 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)
  const matrixTotal = items.reduce((sum, row) => sum + row.revenue, 0)
  const totalUnits = items.reduce((sum, row) => sum + row.units, 0)
  const differs = Math.abs(matrixTotal - revenueNet) > 0.01

  if (items.length === 0 && revenueNet === 0) return <EmptyState>No revenue data for this period.</EmptyState>

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Orders" value={orders} />
        <StatCard label="Gross revenue" value={lyd(gross)} />
        <StatCard label="Discounts" value={lyd(discounts)} />
        {netOfRefunds && <StatCard label="Refunds" value={lyd(refunds)} />}
        <StatCard label="Net revenue" value={lyd(revenueNet)} valueClass="text-noch-green" />
      </div>

      <div className="border border-noch-border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-noch-card">
              <tr className="text-left text-noch-muted text-[10px] uppercase tracking-wide border-b border-noch-border">
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium text-right">Units</th>
                <th className="px-4 py-2.5 font-medium text-right">Unit price</th>
                <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                <th className="px-4 py-2.5 font-medium text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={`${row.name}-${i}`} className="border-b border-noch-border/70 last:border-0">
                  <td className="px-4 py-2.5 text-white">{row.name}</td>
                  <td className="px-4 py-2.5 text-right text-white font-mono">{row.units}</td>
                  <td className="px-4 py-2.5 text-right text-white font-mono">{lyd(row.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right text-white font-mono">{lyd(row.revenue)}</td>
                  <td className="px-4 py-2.5 text-right text-noch-muted font-mono">
                    {matrixTotal > 0 ? pct(row.revenue / matrixTotal) : '—'}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-noch-muted text-sm">
                    No per-product sales for this period.
                  </td>
                </tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t border-noch-border text-white font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono">{totalUnits}</td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-right font-mono">{lyd(matrixTotal)}</td>
                  <td className="px-4 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {differs && (
        <p className="text-noch-muted text-xs mt-3">
          Per-product total <b className="text-white">{lyd(matrixTotal)}</b> vs P&L net revenue <b className="text-white">{lyd(revenueNet)}</b> —
          the per-product table covers base product revenue only; modifier revenue, discounts, and refunds are not broken out per product.
        </p>
      )}
      <p className="text-noch-muted text-[11px] mt-2">
        Revenue is shown net of discounts{netOfRefunds ? ' and refunds' : ''}.
      </p>
    </>
  )
}

function WaterfallRow({ label, amount, indent = false, bold = false, negative = false }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 ${bold ? 'border-t border-noch-border' : 'border-b border-noch-border/70'}`}>
      <p className={`${indent ? 'pl-4 text-noch-muted text-xs' : bold ? 'text-white font-semibold' : 'text-white text-sm'}`}>{label}</p>
      <p className={`font-mono ${indent ? 'text-noch-muted text-xs' : bold ? 'text-white font-bold' : 'text-white text-sm'} ${negative ? 'text-red-300' : ''}`}>
        {amount}
      </p>
    </div>
  )
}

function LaborMissingNote({ children }) {
  return (
    <div className="px-4 py-2 bg-yellow-500/5 border-b border-noch-border/70">
      <p className="text-yellow-300 text-xs">{children}</p>
    </div>
  )
}

// New finance_pnl fields split labor into hourly / salaries / adjustments.
// Older RPC responses don't include them — has=false keeps the UI unchanged.
function laborSplit(pnl) {
  const hourly = pnl?.labor_hourly
  const salary = pnl?.labor_salary
  const adjustments = pnl?.labor_adjustments
  return {
    hourly: Number(hourly || 0),
    salary: Number(salary || 0),
    adjustments: Number(adjustments || 0),
    has: hourly != null || salary != null || adjustments != null,
  }
}

function NetSection({ pnl, isCompanyScope }) {
  const revenue = Number(pnl?.revenue_net || 0)
  const cogs = Number(pnl?.cogs || 0)
  const cogsBase = Number(pnl?.cogs_base || 0)
  const cogsModifiers = Number(pnl?.cogs_modifiers || 0)
  const labor = Number(pnl?.labor || 0)
  const split = laborSplit(pnl)
  const opex = Number(pnl?.opex || 0)
  const net = Number(pnl?.net_contribution || 0)
  const laborMissing = labor === 0 && revenue > 0 && split.hourly === 0 && split.salary === 0 && split.adjustments === 0

  if (revenue === 0 && cogs === 0 && labor === 0 && opex === 0) {
    return <EmptyState>No P&L data for this period.</EmptyState>
  }

  return (
    <>
      <div className="border border-noch-border rounded-xl overflow-hidden">
        <WaterfallRow label="Revenue" amount={lyd(revenue)} />
        <WaterfallRow label="− COGS" amount={lyd(cogs)} />
        <WaterfallRow label="Base products" amount={lyd(cogsBase)} indent />
        <WaterfallRow label="Modifiers" amount={lyd(cogsModifiers)} indent />
        <WaterfallRow label="− Labor" amount={lyd(labor)} />
        {split.has && (
          <>
            <WaterfallRow label="Hourly" amount={lyd(split.hourly)} indent />
            <WaterfallRow label="Salaries" amount={lyd(split.salary)} indent />
            <WaterfallRow label="Adjustments" amount={lyd(split.adjustments)} indent />
          </>
        )}
        {laborMissing && <LaborMissingNote>Labor missing — shift hourly rates not set.</LaborMissingNote>}
        <WaterfallRow label="− Operating expenses" amount={lyd(opex)} />
        <WaterfallRow label="= Net contribution" amount={lyd(net)} bold negative={net < 0} />
      </div>

      <p className="text-noch-muted text-[11px] mt-2">
        Net contribution = revenue − COGS − labor − operating expenses.
        {isCompanyScope ? ' Includes corporate/unallocated expenses, which is why branch rows don\'t sum to this total.' : ''}
      </p>
    </>
  )
}

const PRIME_STATUS_LABEL = {
  good: 'Healthy',
  edge: 'Watch',
  bad: 'At risk',
  neutral: 'No data',
}

function PrimeSection({ pnl, settings }) {
  const revenue = Number(pnl?.revenue_net || 0)
  const cogs = Number(pnl?.cogs || 0)
  const labor = Number(pnl?.labor || 0)
  const split = laborSplit(pnl)
  const prime = Number(pnl?.prime_cost || 0)
  const minPct = Number(settings.prime_cost_min_pct ?? 55)
  const maxPct = Number(settings.prime_cost_max_pct ?? 65)
  const ratio = revenue > 0 ? prime / revenue : null
  const status = statusForRatio(ratio, minPct, maxPct)
  const laborMissing = labor === 0 && revenue > 0 && split.hourly === 0 && split.salary === 0 && split.adjustments === 0

  if (revenue === 0 && cogs === 0 && labor === 0) return <EmptyState>No prime cost data for this period.</EmptyState>

  const rows = [
    { label: 'COGS', amount: cogs },
    { label: 'Labor', amount: labor },
  ]
  const laborSubRows = [
    { label: 'Hourly', amount: split.hourly },
    { label: 'Salaries', amount: split.salary },
    { label: 'Adjustments', amount: split.adjustments },
  ]

  return (
    <>
      <div className="border border-noch-border rounded-xl overflow-hidden mb-4">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5 border-b border-noch-border/70">
            <p className="text-white text-sm">{row.label}</p>
            <p className="font-mono text-white text-sm">
              {lyd(row.amount)} <span className="text-noch-muted text-xs">({revenue > 0 ? pct(row.amount / revenue) : '—'})</span>
            </p>
          </div>
        ))}
        {split.has && laborSubRows.map(row => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2 border-b border-noch-border/70">
            <p className="pl-4 text-noch-muted text-xs">{row.label}</p>
            <p className="font-mono text-noch-muted text-xs">
              {lyd(row.amount)} <span>({revenue > 0 ? pct(row.amount / revenue) : '—'})</span>
            </p>
          </div>
        ))}
        {laborMissing && <LaborMissingNote>Labor missing — prime cost is understated.</LaborMissingNote>}
        <div className="flex items-center justify-between px-4 py-3 bg-noch-card">
          <p className="text-white font-semibold">Prime cost</p>
          <p className="font-mono text-white font-bold text-lg">
            {lyd(prime)} <span className="text-noch-muted text-xs">({pct(ratio)})</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <p className="text-noch-muted">Target band: {minPct}–{maxPct}% of revenue</p>
        <p className={`font-semibold ${STATUS_CLASS[status]}`}>{PRIME_STATUS_LABEL[status]}</p>
      </div>

      <p className="text-noch-muted text-[11px] mt-2">
        Prime cost = COGS + labor. Ratios are against net revenue.
      </p>
    </>
  )
}

// Direct labor drill-down: hourly / salaries / adjustments split with
// amounts and % of revenue, reusing the same laborSplit helper as the
// net and prime sections.
function LaborSection({ pnl }) {
  const revenue = Number(pnl?.revenue_net || 0)
  const labor = Number(pnl?.labor || 0)
  const split = laborSplit(pnl)
  const laborMissing = labor === 0 && revenue > 0 && split.hourly === 0 && split.salary === 0 && split.adjustments === 0

  if (revenue === 0 && labor === 0) return <EmptyState>No labor data for this period.</EmptyState>

  const rows = [
    { label: 'Hourly', amount: split.hourly },
    { label: 'Salaries', amount: split.salary },
    { label: 'Adjustments', amount: split.adjustments },
  ]

  return (
    <>
      <div className="border border-noch-border rounded-xl overflow-hidden">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5 border-b border-noch-border/70">
            <p className="text-white text-sm">{row.label}</p>
            <p className="font-mono text-white text-sm">
              {lyd(row.amount)} <span className="text-noch-muted text-xs">({revenue > 0 ? pct(row.amount / revenue) : '—'})</span>
            </p>
          </div>
        ))}
        {laborMissing && <LaborMissingNote>Labor missing — shift hourly rates not set.</LaborMissingNote>}
        <div className="flex items-center justify-between px-4 py-3 bg-noch-card">
          <p className="text-white font-semibold">Total labor</p>
          <p className="font-mono text-white font-bold text-lg">
            {lyd(labor)} <span className="text-noch-muted text-xs">({revenue > 0 ? pct(labor / revenue) : '—'})</span>
          </p>
        </div>
      </div>

      <p className="text-noch-muted text-[11px] mt-2">
        Labor = hourly shifts + prorated salaries + adjustments. Ratios are against net revenue.
      </p>
    </>
  )
}

// Direct OpEx drill-down: approved/paid expenses grouped by category for the
// period/branch. The categorized sum rarely equals pnl.opex exactly — the P&L
// also includes legacy expense_entries rows and prepaid amortization — so the
// difference is shown as a "Legacy entries" row to keep the total reconciled.
function OpexSection({ pnl, rows }) {
  const pnlOpex = Number(pnl?.opex || 0)
  const byCategory = new Map()
  for (const row of rows || []) {
    const name = row.expense_categories?.name || 'Uncategorised'
    byCategory.set(name, (byCategory.get(name) || 0) + Number(row.amount_lyd || 0))
  }
  const items = [...byCategory.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
  const categorizedTotal = items.reduce((sum, row) => sum + row.amount, 0)
  const legacy = pnlOpex - categorizedTotal
  const hasLegacy = Math.abs(legacy) > 0.01

  if (items.length === 0 && pnlOpex === 0) return <EmptyState>No operating expenses for this period.</EmptyState>

  return (
    <>
      <div className="border border-noch-border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-noch-card">
              <tr className="text-left text-noch-muted text-[10px] uppercase tracking-wide border-b border-noch-border">
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => (
                <tr key={row.name} className="border-b border-noch-border/70 last:border-0">
                  <td className="px-4 py-2.5 text-white">{row.name}</td>
                  <td className="px-4 py-2.5 text-right text-white font-mono">{lyd(row.amount)}</td>
                  <td className="px-4 py-2.5 text-right text-noch-muted font-mono">
                    {pnlOpex > 0 ? pct(row.amount / pnlOpex) : '—'}
                  </td>
                </tr>
              ))}
              {hasLegacy && (
                <tr className="border-b border-noch-border/70 last:border-0">
                  <td className="px-4 py-2.5 text-noch-muted italic">Legacy entries</td>
                  <td className="px-4 py-2.5 text-right text-noch-muted font-mono">{lyd(legacy)}</td>
                  <td className="px-4 py-2.5 text-right text-noch-muted font-mono">
                    {pnlOpex > 0 ? pct(legacy / pnlOpex) : '—'}
                  </td>
                </tr>
              )}
              {items.length === 0 && !hasLegacy && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-noch-muted text-sm">
                    No categorized expenses for this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-noch-border text-white font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right font-mono">{lyd(pnlOpex)}</td>
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {hasLegacy && (
        <p className="text-noch-muted text-xs mt-3">
          Categorized expenses total <b className="text-white">{lyd(categorizedTotal)}</b> vs P&L OpEx <b className="text-white">{lyd(pnlOpex)}</b> —
          the difference is legacy expense entries and prepaid amortization, which are not broken out by category.
        </p>
      )}
      <p className="text-noch-muted text-[11px] mt-2">
        Approved and paid expenses by expense_date. Percentages are against total P&L operating expenses.
      </p>
    </>
  )
}
