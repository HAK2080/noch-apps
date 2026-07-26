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
  return expense.amount_lyd ??
    ((expense.amount || 0) * (expense.exchange_rate_to_lyd || 1))
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
