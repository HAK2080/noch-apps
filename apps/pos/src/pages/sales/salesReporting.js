const EMPTY_SALES_SUMMARY = {
  completedSales: 0,
  refunds: 0,
  netSales: 0,
  discounts: 0,
  orders: 0,
  cash: 0,
  card: 0,
  split: 0,
  presto: 0,
  unclassified: 0,
}

function amount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function summarizeDailySales(rows = []) {
  const summary = { ...EMPTY_SALES_SUMMARY }

  for (const row of rows) {
    summary.completedSales += amount(row.gross)
    summary.refunds += amount(row.refunds)
    summary.discounts += amount(row.discounts)
    summary.orders += amount(row.orders)
    summary.cash += amount(row.cash_sales)
    summary.card += amount(row.card_sales)
    summary.split += amount(row.split_sales)
    summary.presto += amount(row.presto_sales)
  }

  summary.netSales = summary.completedSales - summary.refunds
  summary.unclassified = Math.max(
    0,
    summary.completedSales
      - summary.cash
      - summary.card
      - summary.split
      - summary.presto,
  )

  return summary
}

export function combineSalesSummaries(summaries = []) {
  const combined = { ...EMPTY_SALES_SUMMARY }
  for (const summary of summaries) {
    if (!summary) continue
    for (const key of Object.keys(combined)) {
      if (key === 'netSales' || key === 'unclassified') continue
      combined[key] += amount(summary[key])
    }
  }
  combined.netSales = combined.completedSales - combined.refunds
  combined.unclassified = Math.max(
    0,
    combined.completedSales
      - combined.cash
      - combined.card
      - combined.split
      - combined.presto,
  )
  return combined
}

export function maskCustomerPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? `••••${digits.slice(-4)}` : ''
}
