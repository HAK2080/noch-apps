// DashboardTab.jsx — Expenses: totals + breakdowns
import { useState, useEffect } from 'react'
import { CalendarDays, Loader2, X } from 'lucide-react'
import ExpenseDrilldown from './ExpenseDrilldown'
import { fmt, loadExpenses, loadCostCenters } from './lib/expensesData'
import {
  buildExpenseDashboard,
  getExpenseDateRange,
} from './lib/expenseDashboard'

export default function DashboardTab({ refreshKey }) {
  const [expenses, setExpenses] = useState([])
  const [costCenters, setCostCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [dateRange, setDateRange] = useState(() => getExpenseDateRange('month'))
  const [selectedCc, setSelectedCc] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('paid')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (
        !dateRange.startDate ||
        !dateRange.endDate ||
        dateRange.startDate > dateRange.endDate
      ) {
        if (!cancelled) setLoading(false)
        return
      }
      setLoading(true)
      const [exp, ccs] = await Promise.all([
        loadExpenses({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
        loadCostCenters(),
      ])
      if (cancelled) return
      setExpenses(exp)
      setCostCenters(ccs)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, dateRange.startDate, dateRange.endDate])

  const {
    total,
    pending,
    approved,
    paid,
    byCostCenter: byCc,
    byCategory,
    drillTotal,
  } = buildExpenseDashboard(expenses, costCenters, {
    selectedCostCenterId: selectedCc,
  })

  const selectedCcName = costCenters.find(cc => cc.id === selectedCc)?.name
  const invalidRange = dateRange.startDate &&
    dateRange.endDate &&
    dateRange.startDate > dateRange.endDate

  function resetDrilldown() {
    setSelectedCc('')
    setSelectedCategory('')
    setSelectedStatus('paid')
  }

  function selectPreset(nextPeriod) {
    setPeriod(nextPeriod)
    setDateRange(getExpenseDateRange(nextPeriod))
    resetDrilldown()
  }

  function setCustomDate(field, value) {
    setPeriod('custom')
    setDateRange(current => ({ ...current, [field]: value }))
    resetDrilldown()
  }

  function selectCostCenter(costCenterId) {
    setSelectedCc(current => current === costCenterId ? '' : costCenterId)
    setSelectedCategory('')
  }

  function selectStatus(status) {
    setSelectedStatus(status)
  }

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {[['month','This Month'],['quarter','This Quarter'],['year','This Year']].map(([v,l]) => (
            <button key={v} onClick={() => selectPreset(v)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                ${period === v ? 'bg-noch-green text-black' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}>
              {l}
            </button>
          ))}
          <button
            onClick={() => setPeriod('custom')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1.5
              ${period === 'custom' ? 'bg-noch-green text-black' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}
          >
            <CalendarDays size={13} />
            Custom Range
          </button>
        </div>

        {period === 'custom' && (
          <div className="bg-noch-card border border-noch-border rounded-xl p-3 flex flex-wrap items-end gap-3">
            <label className="space-y-1 min-w-[160px]">
              <span className="block text-xs text-noch-muted">From date</span>
              <input
                type="date"
                aria-label="Expense start date"
                value={dateRange.startDate}
                max={dateRange.endDate || undefined}
                onChange={event => setCustomDate('startDate', event.target.value)}
                className="input w-full text-sm"
              />
            </label>
            <label className="space-y-1 min-w-[160px]">
              <span className="block text-xs text-noch-muted">To date</span>
              <input
                type="date"
                aria-label="Expense end date"
                value={dateRange.endDate}
                min={dateRange.startDate || undefined}
                onChange={event => setCustomDate('endDate', event.target.value)}
                className="input w-full text-sm"
              />
            </label>
            <p className={`pb-2 text-xs ${invalidRange ? 'text-red-400' : 'text-noch-muted'}`}>
              {invalidRange
                ? 'The end date must be on or after the start date.'
                : 'Both dates are included in the figures.'}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-noch-muted">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { status: 'all', label: 'Total Submitted', value: total, color: 'text-white' },
              { status: 'pending', label: 'Pending Approval', value: pending, color: 'text-yellow-400' },
              { status: 'approved', label: 'Approved', value: approved, color: 'text-noch-green' },
              { status: 'paid', label: 'Paid Out', value: paid, color: 'text-blue-400' },
            ].map(({ status, label, value, color }) => (
              <button
                key={label}
                type="button"
                onClick={() => selectStatus(status)}
                aria-pressed={selectedStatus === status}
                className={`bg-noch-card border rounded-xl p-4 text-left transition-colors ${
                  selectedStatus === status
                    ? 'border-noch-green/70 bg-noch-green/5'
                    : 'border-noch-border hover:border-noch-muted/50'
                }`}
              >
                <p className={`text-xl font-bold ${color}`}>{fmt(value)}</p>
                <p className="text-xs text-noch-muted mt-0.5">{label}</p>
                <p className="text-[10px] text-noch-muted/70 mt-2">
                  Click to inspect
                </p>
              </button>
            ))}
          </div>

          {/* By cost center — click a row to drill in */}
          {byCc.length > 0 && (
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-3">By Cost Center</h3>
              <div className="space-y-1">
                {byCc.map(cc => {
                  const pct = total > 0 ? Math.round((cc.total / total) * 100) : 0
                  const isSelected = selectedCc === cc.id
                  return (
                    <button key={cc.id}
                      onClick={() => selectCostCenter(cc.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-3
                        ${isSelected ? 'bg-noch-green/15 border border-noch-green/30' : 'hover:bg-noch-dark/60'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">{cc.id} — {cc.name}</span>
                          {cc.pending > 0 && <span className="text-xs text-yellow-400">{cc.pending} pending</span>}
                        </div>
                        <div className="mt-1 h-1 bg-noch-border rounded-full overflow-hidden">
                          <div className="h-full bg-noch-green rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold text-white tabular-nums">{fmt(cc.total)}</span>
                        <span className="ml-2 text-xs text-noch-muted">{pct}%</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {selectedCc && (
                <button onClick={() => selectCostCenter(selectedCc)}
                  className="mt-2 text-xs text-noch-muted hover:text-white flex items-center gap-1">
                  <X size={11} /> Clear filter
                </button>
              )}
            </div>
          )}

          {/* By category — scoped to selected CC */}
          {byCategory.length > 0 && (
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">
                  By Category
                  {selectedCcName && (
                    <span className="ml-2 text-noch-green font-normal">— {selectedCcName}</span>
                  )}
                </h3>
                {selectedCc && (
                  <span className="text-xs text-noch-muted">{fmt(drillTotal)} total</span>
                )}
              </div>
              <div className="space-y-2">
                {byCategory.map(c => {
                  const pct = drillTotal > 0 ? Math.round((c.total / drillTotal) * 100) : 0
                  const isSelected = selectedCategory === c.name
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(isSelected ? '' : c.name)
                      }}
                      aria-pressed={isSelected}
                      className={`block w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                        isSelected
                          ? 'bg-noch-green/10 ring-1 ring-noch-green/30'
                          : 'hover:bg-noch-dark/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${
                          isSelected ? 'text-noch-green' : 'text-noch-muted'
                        }`}>{c.name}
                          <span className="ml-1 text-xs opacity-50">×{c.count}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-noch-muted">{pct}%</span>
                          <span className="text-sm font-semibold text-white tabular-nums">{fmt(c.total)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-noch-border rounded-full overflow-hidden">
                        <div className="h-full bg-noch-green/50 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {expenses.length > 0 && (
            <ExpenseDrilldown
              key={[
                dateRange.startDate,
                dateRange.endDate,
                selectedCc,
                selectedCategory,
                selectedStatus,
              ].join(':')}
              expenses={expenses}
              dateRange={dateRange}
              selectedCc={selectedCc}
              selectedCcName={selectedCcName}
              selectedCategory={selectedCategory}
              selectedStatus={selectedStatus}
              onSelectStatus={selectStatus}
            />
          )}

          {expenses.length === 0 && (
            <div className="text-center py-8 text-noch-muted">No expenses recorded this period</div>
          )}
        </>
      )}
    </div>
  )
}
