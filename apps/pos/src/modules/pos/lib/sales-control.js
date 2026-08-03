const EPSILON = 0.005

const numericFields = [
  'order_count',
  'completed_sales',
  'linked_refunds',
  'net_sales',
  'gross_cash_tender',
  'gross_card_tender',
  'gross_presto_tender',
  'gross_other_tender',
  'period_cash_movement',
  'period_card_movement',
  'period_presto_movement',
  'period_other_movement',
  'period_refunds',
  'period_void_reversals',
  'period_net_tender_movement',
  'payment_reconciliation_variance',
  'period_event_variance',
  'timing_variance',
  'reconstructed_event_count',
  'untracked_order_count',
  'presto_unsettled_amount',
  'presto_unsettled_count',
]

function numberOrZero(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function varianceStatus(value) {
  return Math.abs(numberOrZero(value)) < EPSILON ? 'reconciled' : 'warning'
}

export function normalizeSalesControl(row) {
  if (!row) return null

  const normalized = { ...row }
  for (const field of numericFields) {
    normalized[field] = numberOrZero(row[field])
  }

  normalized.grossTenderTotal =
    normalized.gross_cash_tender
    + normalized.gross_card_tender
    + normalized.gross_presto_tender
    + normalized.gross_other_tender
  normalized.periodTenderTotal =
    normalized.period_cash_movement
    + normalized.period_card_movement
    + normalized.period_presto_movement
    + normalized.period_other_movement
  normalized.paymentStatus = varianceStatus(normalized.payment_reconciliation_variance)
  normalized.eventStatus = varianceStatus(normalized.period_event_variance)
  normalized.dataStatus = normalized.untracked_order_count > 0
    ? 'unavailable'
    : normalized.reconstructed_event_count > 0
      ? 'warning'
      : 'complete'
  normalized.settlementStatus = normalized.card_settlement_status === 'available'
    ? 'available'
    : 'unavailable'

  return normalized
}

export function combineSalesControls(rows = []) {
  const controls = rows.map(normalizeSalesControl).filter(Boolean)
  const combined = controls.reduce((totals, control) => {
    for (const field of numericFields) totals[field] += control[field]
    return totals
  }, Object.fromEntries(numericFields.map(field => [field, 0])))

  combined.card_settlement_status = controls.every(
    control => control.card_settlement_status === 'available',
  ) ? 'available' : 'unavailable'
  combined.latest_order_at = controls
    .map(control => control.latest_order_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null
  combined.latest_tender_event_at = controls
    .map(control => control.latest_tender_event_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null
  return normalizeSalesControl(combined)
}

const shiftNumericFields = [
  'opening_cash',
  'expected_drawer_cash',
  'net_sales',
  'order_count',
  'net_cash_tender',
  'net_card_tender',
  'net_presto_tender',
  'net_other_tender',
  'refunds',
  'void_reversals',
  'payment_reconciliation_variance',
  'paid_in',
  'paid_out',
  'safe_drop',
  'tip_out',
  'stored_expected_cash',
  'stored_expected_variance',
  'stored_sales_variance',
  'reconstructed_event_count',
  'untracked_order_count',
]

export function normalizeShiftControl(row) {
  if (!row) return null

  const normalized = { ...row }
  for (const field of shiftNumericFields) {
    normalized[field] = numberOrZero(row[field])
  }
  normalized.counted_drawer_cash = row.counted_drawer_cash == null
    ? null
    : numberOrZero(row.counted_drawer_cash)
  normalized.cash_variance = row.cash_variance == null
    ? null
    : numberOrZero(row.cash_variance)
  normalized.cash_counted = row.cash_counted === true
  normalized.paymentStatus = varianceStatus(normalized.payment_reconciliation_variance)
  normalized.counterStatus =
    varianceStatus(normalized.stored_expected_variance) === 'reconciled'
    && varianceStatus(normalized.stored_sales_variance) === 'reconciled'
      ? 'reconciled'
      : 'warning'
  normalized.dataStatus = normalized.untracked_order_count > 0
    ? 'unavailable'
    : normalized.reconstructed_event_count > 0
      ? 'warning'
      : 'complete'
  normalized.closeStatus = normalized.status === 'closed' && !normalized.cash_counted
    ? 'missing_count'
    : normalized.status

  return normalized
}

export function combineShiftControls(rows = []) {
  return rows
    .map(normalizeShiftControl)
    .filter(Boolean)
    .reduce((totals, shift) => {
      totals.shiftCount += 1
      totals.netSales += shift.net_sales
      totals.orderCount += shift.order_count
      totals.cash += shift.net_cash_tender
      totals.card += shift.net_card_tender
      totals.presto += shift.net_presto_tender
      totals.other += shift.net_other_tender
      totals.refunds += shift.refunds
      totals.voids += shift.void_reversals
      totals.paymentVariance += shift.payment_reconciliation_variance
      totals.reconstructedEvents += shift.reconstructed_event_count
      totals.untrackedOrders += shift.untracked_order_count
      if (shift.status === 'closed' && !shift.cash_counted) totals.missingCounts += 1
      if (shift.cash_variance != null) totals.cashVariance += shift.cash_variance
      return totals
    }, {
      shiftCount: 0,
      netSales: 0,
      orderCount: 0,
      cash: 0,
      card: 0,
      presto: 0,
      other: 0,
      refunds: 0,
      voids: 0,
      paymentVariance: 0,
      cashVariance: 0,
      missingCounts: 0,
      reconstructedEvents: 0,
      untrackedOrders: 0,
    })
}

export function refundTenderOptions(paymentMethod) {
  const method = String(paymentMethod || '').toLowerCase()
  const options = ['original']
  if (method !== 'cash') options.push('cash')
  if (method !== 'card') options.push('card')
  if (method === 'presto') options.push('presto')
  return options
}
