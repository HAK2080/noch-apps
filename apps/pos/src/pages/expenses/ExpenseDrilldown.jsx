import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
} from 'lucide-react'
import { downloadCsv } from '../../lib/exportCsv'
import { fmt } from './lib/expensesData'
import {
  buildExpenseDrilldown,
  expenseAmountLyd,
  expenseExportHeaders,
  expenseExportRows,
} from './lib/expenseDashboard'

const STATUS_OPTIONS = [
  { id: 'all', label: 'All submitted' },
  { id: 'paid', label: 'Paid out' },
  { id: 'approved', label: 'Approved' },
  { id: 'pending', label: 'Pending' },
]

function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value.slice(0, 10)}T00:00:00`)
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ExpenseDrilldown({
  expenses,
  dateRange,
  selectedCc,
  selectedCcName,
  selectedCategory,
  selectedStatus,
  onSelectStatus,
}) {
  const [expandedExpenseId, setExpandedExpenseId] = useState('')
  const [showAllExpenses, setShowAllExpenses] = useState(false)
  const drilldown = buildExpenseDrilldown(expenses, {
    selectedCostCenterId: selectedCc,
    selectedCategoryName: selectedCategory,
    selectedStatus,
  })
  const visibleExpenses = showAllExpenses
    ? drilldown.rows
    : drilldown.topRows

  function exportExpenses() {
    const scope = [
      dateRange.startDate,
      dateRange.endDate,
      selectedStatus,
      selectedCc || 'all-centers',
      selectedCategory || 'all-categories',
    ]
      .map(value => value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))
      .join('_')

    downloadCsv(
      `expenses_${scope}.csv`,
      expenseExportHeaders,
      expenseExportRows(drilldown.rows),
    )
  }

  return (
    <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-noch-border space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-semibold text-sm">
              Payment drill-down
            </h3>
            <p className="text-xs text-noch-muted mt-1">
              Highest payments first. Click any row for payment, submitter,
              and receipt details.
            </p>
          </div>
          <button
            type="button"
            onClick={exportExpenses}
            disabled={drilldown.count === 0}
            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-40"
            title="Download all matching rows as an Excel-compatible CSV"
          >
            <Download size={13} />
            Export CSV for Excel
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelectStatus(option.id)}
              aria-pressed={selectedStatus === option.id}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                selectedStatus === option.id
                  ? 'bg-noch-green text-black border-noch-green'
                  : 'border-noch-border text-noch-muted hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-noch-muted">
            {dateRange.startDate} to {dateRange.endDate}
            {selectedCcName ? ` • ${selectedCcName}` : ''}
            {selectedCategory ? ` • ${selectedCategory}` : ''}
          </p>
          <p className="text-white">
            <span className="font-semibold">{drilldown.count}</span>
            {' '}records •{' '}
            <span className="font-semibold">{fmt(drilldown.total)}</span>
          </p>
        </div>
      </div>

      {drilldown.count === 0 ? (
        <div className="p-8 text-center text-sm text-noch-muted">
          No expenses match these filters.
        </div>
      ) : (
        <>
          <div className="px-4 py-2 bg-noch-dark/40 border-b border-noch-border flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-white">
              {showAllExpenses
                ? `All ${drilldown.count} matching expenses`
                : `${Math.min(10, drilldown.count)} highest payments`}
            </p>
            <p className="text-[10px] text-noch-muted">
              CSV includes all {drilldown.count} matching records
            </p>
          </div>

          <div className="divide-y divide-noch-border">
            {visibleExpenses.map(expense => {
              const expanded = expandedExpenseId === expense.id
              const statusClass = expense.status === 'paid'
                ? 'text-blue-300 bg-blue-500/10 border-blue-500/20'
                : expense.status === 'approved'
                  ? 'text-noch-green bg-noch-green/10 border-noch-green/20'
                  : 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'

              return (
                <div key={expense.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedExpenseId(
                      expanded ? '' : expense.id,
                    )}
                    aria-expanded={expanded}
                    className="w-full p-4 text-left hover:bg-noch-dark/40 transition-colors"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[110px_minmax(180px,1fr)_minmax(150px,0.7fr)_100px_130px_20px] gap-2 md:gap-4 items-center">
                      <span className="text-xs text-noch-muted">
                        {formatDate(expense.expense_date)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm text-white font-medium truncate">
                          {expense.description || expense.vendor || 'Expense'}
                        </span>
                        <span className="block text-xs text-noch-muted truncate">
                          {expense.vendor || 'No vendor'}
                          {expense.profiles?.full_name
                            ? ` • ${expense.profiles.full_name}`
                            : ''}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs text-white truncate">
                          {expense.cost_center_id}
                          {expense.cost_centers?.name
                            ? ` — ${expense.cost_centers.name}`
                            : ''}
                        </span>
                        <span className="block text-[11px] text-noch-muted truncate">
                          {expense.expense_categories?.name || 'Other'}
                        </span>
                      </span>
                      <span className={`justify-self-start rounded-full border px-2 py-1 text-[10px] uppercase ${statusClass}`}>
                        {expense.status}
                      </span>
                      <span className="text-sm font-semibold text-white tabular-nums md:text-right">
                        {fmt(expenseAmountLyd(expense))}
                      </span>
                      {expanded
                        ? <ChevronUp size={15} className="text-noch-muted" />
                        : <ChevronDown size={15} className="text-noch-muted" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-4 pb-4">
                      <div className="rounded-lg border border-noch-border bg-noch-dark/50 p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        <div>
                          <p className="text-noch-muted">Original amount</p>
                          <p className="text-white mt-1">
                            {Number(expense.amount || 0).toFixed(2)}
                            {' '}{expense.currency || 'LYD'}
                          </p>
                          <p className="text-[10px] text-noch-muted mt-1">
                            Rate: {expense.exchange_rate_to_lyd || 1} to LYD
                          </p>
                        </div>
                        <div>
                          <p className="text-noch-muted">Submitted</p>
                          <p className="text-white mt-1">
                            {expense.profiles?.full_name || 'Unknown'}
                          </p>
                          <p className="text-[10px] text-noch-muted mt-1">
                            {formatDateTime(expense.submitted_at)}
                          </p>
                        </div>
                        <div>
                          <p className="text-noch-muted">Payment</p>
                          <p className="text-white mt-1">
                            {expense.payment_account_key || 'Not recorded'}
                          </p>
                          <p className="text-[10px] text-noch-muted mt-1">
                            {expense.paid_at
                              ? formatDateTime(expense.paid_at)
                              : 'Not paid yet'}
                          </p>
                        </div>
                        <div>
                          <p className="text-noch-muted">Reference</p>
                          <p className="text-white mt-1 break-words">
                            {expense.payment_reference || '—'}
                          </p>
                        </div>
                        {expense.payment_notes && (
                          <div className="sm:col-span-2 lg:col-span-3">
                            <p className="text-noch-muted">Payment notes</p>
                            <p className="text-white mt-1 whitespace-pre-wrap">
                              {expense.payment_notes}
                            </p>
                          </div>
                        )}
                        {expense.receipt_url && (
                          <div>
                            <p className="text-noch-muted mb-1">Receipt</p>
                            <a
                              href={expense.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-noch-green hover:underline"
                            >
                              Open receipt <ExternalLink size={11} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {drilldown.count > 10 && (
            <div className="p-3 border-t border-noch-border text-center">
              <button
                type="button"
                onClick={() => setShowAllExpenses(current => !current)}
                className="text-xs text-noch-green hover:underline"
              >
                {showAllExpenses
                  ? 'Show only the 10 highest payments'
                  : `Show all ${drilldown.count} payments`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
