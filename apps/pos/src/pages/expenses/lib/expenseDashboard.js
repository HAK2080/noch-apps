export function toDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getExpenseDateRange(period, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth()
  let start
  let end

  if (period === 'quarter') {
    const quarterStart = Math.floor(month / 3) * 3
    start = new Date(year, quarterStart, 1)
    end = new Date(year, quarterStart + 3, 0)
  } else if (period === 'year') {
    start = new Date(year, 0, 1)
    end = new Date(year, 11, 31)
  } else {
    start = new Date(year, month, 1)
    end = new Date(year, month + 1, 0)
  }

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  }
}

export function expenseAmountLyd(expense) {
  return Number(
    expense.amount_lyd ??
    ((expense.amount || 0) * (expense.exchange_rate_to_lyd || 1)),
  ) || 0
}

export function buildExpenseDrilldown(
  expenses,
  {
    selectedCostCenterId = '',
    selectedCategoryName = '',
    selectedStatus = 'all',
  } = {},
) {
  const rows = expenses
    .filter(expense => expense.status !== 'rejected')
    .filter(expense => (
      !selectedCostCenterId ||
      expense.cost_center_id === selectedCostCenterId
    ))
    .filter(expense => (
      !selectedCategoryName ||
      (expense.expense_categories?.name || 'Other') === selectedCategoryName
    ))
    .filter(expense => (
      selectedStatus === 'all' ||
      expense.status === selectedStatus
    ))
    .sort((a, b) => {
      const amountDifference = expenseAmountLyd(b) - expenseAmountLyd(a)
      if (amountDifference !== 0) return amountDifference
      return String(b.expense_date || b.submitted_at || '')
        .localeCompare(String(a.expense_date || a.submitted_at || ''))
    })

  return {
    rows,
    topRows: rows.slice(0, 10),
    count: rows.length,
    total: rows.reduce(
      (sum, expense) => sum + expenseAmountLyd(expense),
      0,
    ),
  }
}

export const expenseExportHeaders = [
  'Expense Date',
  'Paid At',
  'Status',
  'Amount LYD',
  'Original Amount',
  'Currency',
  'Exchange Rate to LYD',
  'Cost Center Code',
  'Cost Center',
  'Category',
  'Vendor',
  'Description',
  'Submitted By',
  'Submitted At',
  'Payment Account',
  'Payment Reference',
  'Payment Notes',
  'Receipt URL',
]

export function expenseExportRows(expenses) {
  return expenses.map(expense => [
    expense.expense_date || '',
    expense.paid_at || '',
    expense.status || '',
    expenseAmountLyd(expense).toFixed(2),
    Number(expense.amount || 0).toFixed(2),
    expense.currency || 'LYD',
    expense.exchange_rate_to_lyd == null
      ? ''
      : String(expense.exchange_rate_to_lyd),
    expense.cost_center_id || '',
    expense.cost_centers?.name || '',
    expense.expense_categories?.name || 'Other',
    expense.vendor || '',
    expense.description || '',
    expense.profiles?.full_name || '',
    expense.submitted_at || '',
    expense.payment_account_key || '',
    expense.payment_reference || '',
    expense.payment_notes || '',
    expense.receipt_url || '',
  ])
}

export function buildExpenseDashboard(
  expenses,
  costCenters,
  { selectedCostCenterId = '' } = {},
) {
  const active = expenses.filter(expense => expense.status !== 'rejected')
  const sum = rows => rows.reduce(
    (total, expense) => total + expenseAmountLyd(expense),
    0,
  )

  const total = sum(active)
  const pending = sum(active.filter(expense => expense.status === 'pending'))
  const approved = sum(active.filter(expense => expense.status === 'approved'))
  const paid = sum(active.filter(expense => expense.status === 'paid'))

  const byCostCenter = costCenters
    .map(costCenter => {
      const rows = active.filter(
        expense => expense.cost_center_id === costCenter.id,
      )
      return {
        ...costCenter,
        total: sum(rows),
        count: rows.length,
        pending: rows.filter(expense => expense.status === 'pending').length,
      }
    })
    .filter(costCenter => costCenter.count > 0)
    .sort((a, b) => b.total - a.total)

  const drillExpenses = selectedCostCenterId
    ? active.filter(
        expense => expense.cost_center_id === selectedCostCenterId,
      )
    : active
  const categoryMap = {}
  drillExpenses.forEach(expense => {
    const name = expense.expense_categories?.name || 'Other'
    if (!categoryMap[name]) {
      categoryMap[name] = { name, total: 0, count: 0 }
    }
    categoryMap[name].total += expenseAmountLyd(expense)
    categoryMap[name].count += 1
  })

  return {
    total,
    pending,
    approved,
    paid,
    byCostCenter,
    byCategory: Object.values(categoryMap).sort((a, b) => b.total - a.total),
    drillTotal: sum(drillExpenses),
  }
}
