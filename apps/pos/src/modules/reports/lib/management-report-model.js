import { businessDayWindow } from '../../pos/lib/business-time.js'

const WHATSAPP_PROBLEM_STATUSES = new Set([
  'failed',
  'undelivered',
  'error',
  'cooldown_recent_send',
  'not_opted_in',
  'missing_template_sid',
])

const WHATSAPP_IN_FLIGHT_STATUSES = new Set([
  'queued',
  'pending',
  'claimed',
  'sent',
])

const money = value => Number(value || 0)
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)

function latestTimestamp(rows, key) {
  return rows.reduce((latest, row) => {
    const value = row?.[key]
    return value && (!latest || String(value) > String(latest)) ? value : latest
  }, null)
}

function expenseAmount(row) {
  return money(row.amount_lyd ?? (money(row.amount) * money(row.exchange_rate_to_lyd || 1)))
}

function normalizePnl(pnl = {}) {
  const netSales = money(pnl.revenue_net)
  const cogs = money(pnl.cogs)
  const labor = money(pnl.labor)
  const directLabor = money(pnl.labor_direct ?? labor)
  const operatingExpenses = money(pnl.opex)
  const directOperatingExpenses = money(pnl.opex_direct ?? operatingExpenses)
  const sharedOperatingCosts = money(pnl.shared_costs_allocated)
  const directOperatingProfit = money(
    pnl.net_contribution_before_shared
      ?? (netSales - cogs - directLabor - directOperatingExpenses),
  )
  const fullyLoadedOperatingProfit = money(
    pnl.net_contribution
      ?? (directOperatingProfit - sharedOperatingCosts),
  )

  return {
    netSales,
    completedSalesAfterDiscounts: netSales + money(pnl.refunds),
    discounts: money(pnl.discounts),
    refunds: money(pnl.refunds),
    orders: money(pnl.orders),
    averageOrder: money(pnl.orders) > 0 ? netSales / money(pnl.orders) : 0,
    cogs,
    labor,
    directLabor,
    sharedLabor: money(pnl.labor_shared_allocated),
    operatingExpenses,
    directOperatingExpenses,
    sharedOperatingExpenses: money(pnl.opex_shared_allocated),
    sharedOperatingCosts,
    directOperatingProfit,
    fullyLoadedOperatingProfit,
    capitalExpenses: money(pnl.capex),
    dataQuality: pnl.data_quality || {},
  }
}

function normalizeInventory(source) {
  if (source.status !== 'complete') {
    return {
      rows: [],
      lowStockCount: null,
      outOfStockCount: null,
      staleCount: null,
      usageUnavailableCount: null,
    }
  }

  const rows = source.rows.map(row => ({
    ingredientId: row.ingredient_id,
    name: row.ingredient_name || 'Stock item',
    unit: row.unit || '',
    countedQty: money(row.counted_qty),
    theoreticalQty: row.theoretical_qty == null ? null : money(row.theoretical_qty),
    decisionQty: row.theoretical_qty == null
      ? money(row.counted_qty)
      : money(row.theoretical_qty),
    recipeUsageAvailable: row.recipe_usage_status === 'available',
    minThreshold: money(row.min_threshold),
    lastCountedAt: row.last_counted_at || null,
    countIsStale: Boolean(row.count_is_stale),
  }))
  const riskRows = rows
    .filter(row => row.minThreshold > 0 && row.decisionQty < row.minThreshold)
    .sort((left, right) => {
      const leftRatio = left.minThreshold ? left.decisionQty / left.minThreshold : 1
      const rightRatio = right.minThreshold ? right.decisionQty / right.minThreshold : 1
      return leftRatio - rightRatio
    })

  return {
    rows: riskRows.slice(0, 8),
    lowStockCount: riskRows.length,
    outOfStockCount: riskRows.filter(row => row.decisionQty <= 0).length,
    staleCount: rows.filter(row => row.countIsStale).length,
    usageUnavailableCount: rows.filter(row => !row.recipeUsageAvailable).length,
  }
}

function normalizePayments(source, financeNetSales) {
  if (source.status !== 'complete') {
    return {
      status: 'unavailable',
      orderCount: null,
      completedSales: null,
      cashCollected: null,
      cardCollected: null,
      prestoCollected: null,
      otherCollected: null,
      refunds: null,
      netSales: null,
      financeNetSales,
      variance: null,
      reconciliationStatus: 'unavailable',
    }
  }

  const row = source.rows?.[0] || {}
  const paymentNetSales = money(row.net_sales)
  const variance = paymentNetSales - financeNetSales

  return {
    status: 'complete',
    orderCount: money(row.order_count),
    completedSales: money(row.completed_sales),
    cashCollected: money(row.cash_collected),
    cardCollected: money(row.card_collected),
    prestoCollected: money(row.presto_collected),
    otherCollected: money(row.other_collected),
    refunds: money(row.refunds),
    netSales: paymentNetSales,
    financeNetSales,
    variance,
    reconciliationStatus: Math.abs(variance) <= 0.01 ? 'reconciled' : 'warning',
  }
}

function buildBranchPerformance(branchPnls, consolidatedFinance, branchId) {
  const rows = branchPnls
    .filter(({ branch }) => !branchId || branch.id === branchId)
    .map(({ branch, pnl }) => ({
    id: branch.id,
    name: branch.name,
    operationalStatus: branch.operational_status || 'operating',
    ...normalizePnl(pnl),
    dataQuality: pnl?.data_quality || {},
    }))
  const branchTotals = rows.reduce((totals, row) => {
    totals.netSales += row.netSales
    totals.cogs += row.cogs
    totals.labor += row.labor
    totals.operatingExpenses += row.operatingExpenses
    totals.sharedOperatingCosts += row.sharedOperatingCosts
    totals.fullyLoadedOperatingProfit += row.fullyLoadedOperatingProfit
    return totals
  }, {
    netSales: 0,
    cogs: 0,
    labor: 0,
    operatingExpenses: 0,
    sharedOperatingCosts: 0,
    fullyLoadedOperatingProfit: 0,
  })
  const comparisons = [
    ['netSales', consolidatedFinance.netSales],
    ['cogs', consolidatedFinance.cogs],
    ['labor', consolidatedFinance.labor],
    ['operatingExpenses', consolidatedFinance.operatingExpenses],
    ['sharedOperatingCosts', consolidatedFinance.sharedOperatingCosts],
    ['fullyLoadedOperatingProfit', consolidatedFinance.fullyLoadedOperatingProfit],
  ].map(([id, consolidated]) => ({
    id,
    consolidated,
    branchTotal: branchTotals[id],
    delta: consolidated - branchTotals[id],
  }))
  const material = comparisons.filter(row => Math.abs(row.delta) > 0.01)
  const unallocatedExpenseCount = money(consolidatedFinance.dataQuality?.unallocated_expense_count)
  const adjustmentIsExplained = unallocatedExpenseCount > 0
    && material.length > 0
    && material.every(row => ['operatingExpenses', 'fullyLoadedOperatingProfit'].includes(row.id))
    && Math.abs(
      money(comparisons.find(row => row.id === 'operatingExpenses')?.delta)
      + money(comparisons.find(row => row.id === 'fullyLoadedOperatingProfit')?.delta),
    ) <= 0.01
  const adjustment = Object.fromEntries(
    comparisons.map(row => [row.id, row.delta]),
  )

  return {
    rows,
    adjustment: material.length
      ? {
          id: 'corporate-unallocated',
          name: 'Corporate / unallocated',
          orders: 0,
          ...adjustment,
        }
      : null,
    reconciliation: {
      status: material.length
        ? adjustmentIsExplained ? 'reconciled_with_adjustment' : 'warning'
        : 'reconciled',
      comparisons,
      material,
    },
  }
}

function buildSources({ generatedAt, currentPnl, optionalSources }) {
  const financeQuality = currentPnl?.data_quality || {}
  const financeSource = {
    id: 'finance',
    label: 'Authoritative P&L',
    scope: 'Selected report scope',
    status: 'complete',
    asOf: financeQuality.latest_sale_at || generatedAt,
    error: null,
  }

  return [
    financeSource,
    ...optionalSources.map(source => ({
      id: source.id,
      label: source.label,
      scope: source.scope,
      status: source.status,
      asOf: source.status === 'complete'
        ? latestTimestamp(
          source.rows,
          source.id === 'payments'
            ? 'latest_order_at'
            : source.id === 'inventory'
            ? 'last_counted_at'
            : source.id === 'expenses'
              ? 'updated_at'
              : source.id === 'loyalty'
                ? 'last_visit_at'
                : 'created_at',
        )
        : null,
      error: source.error,
    })),
  ]
}

function buildCompleteness({
  currentPnl,
  sources,
  inventory,
  payments,
  branchReconciliation,
}) {
  const issues = []
  const quality = currentPnl?.data_quality || {}

  if (!hasOwn(currentPnl, 'data_quality')) {
    issues.push({
      id: 'finance_quality_missing',
      severity: 'risk',
      title: 'Finance completeness evidence is missing',
      detail: 'The P&L source cannot prove product-cost and expense-allocation completeness.',
    })
  }
  if (!hasOwn(currentPnl, 'shared_costs_allocated') || !hasOwn(currentPnl, 'net_contribution_before_shared')) {
    issues.push({
      id: 'finance_model_incomplete',
      severity: 'risk',
      title: 'Shared operating costs are missing',
      detail: 'The P&L source does not expose the fully loaded cost model.',
    })
  }
  if (money(quality.missing_product_cost_count) > 0) {
    issues.push({
      id: 'missing_product_costs',
      severity: 'risk',
      title: 'Product costs are incomplete',
      detail: `${money(quality.missing_product_cost_count)} sold product(s) have no cost, so COGS and profit are understated.`,
    })
  }
  if (money(quality.unallocated_expense_count) > 0) {
    issues.push({
      id: 'unallocated_expenses',
      severity: 'warn',
      title: 'Expenses need a cost center',
      detail: `${money(quality.unallocated_expense_count)} approved expense(s) are consolidated-only until allocated.`,
    })
  }
  if (inventory.staleCount > 0) {
    issues.push({
      id: 'stale_inventory_counts',
      severity: 'warn',
      title: 'Physical counts are stale',
      detail: `${inventory.staleCount} inventory count(s) are more than seven days old.`,
    })
  }
  if (inventory.usageUnavailableCount > 0) {
    issues.push({
      id: 'inventory_recipe_usage_missing',
      severity: 'risk',
      title: 'Inventory usage evidence is incomplete',
      detail: `${inventory.usageUnavailableCount} ingredient(s) have no explicit recipe links, so theoretical usage is unavailable.`,
    })
  }
  if (payments.reconciliationStatus === 'warning') {
    issues.push({
      id: 'payment_reconciliation_variance',
      severity: 'risk',
      title: 'Sales and payments do not reconcile',
      detail: `Payment net sales differ from Finance P&L by ${Math.abs(payments.variance).toFixed(2)} LYD.`,
    })
  }
  if (branchReconciliation.status === 'warning') {
    issues.push({
      id: 'branch_reconciliation_variance',
      severity: 'warn',
      title: 'Branch totals need reconciliation',
      detail: `${branchReconciliation.material.length} consolidated metric(s) differ from the sum of branches. Unallocated costs may explain the difference.`,
    })
  }
  for (const source of sources.filter(source => source.status === 'unavailable')) {
    issues.push({
      id: `${source.id}_unavailable`,
      severity: 'warn',
      title: `${source.label} unavailable`,
      detail: source.error || 'This source could not be read and is not represented as zero.',
    })
  }

  return {
    status: issues.length ? 'warning' : 'complete',
    issues,
  }
}

export function buildManagementReport({
  period,
  branchId = null,
  branches = [],
  currentPnl = {},
  previousPnl = {},
  branchPnls = [],
  optionalSources = [],
  generatedAt = new Date().toISOString(),
}) {
  const finance = normalizePnl(currentPnl)
  const previousFinance = normalizePnl(previousPnl)
  const inventorySource = optionalSources.find(source => source.id === 'inventory')
    || { status: 'unavailable', rows: [] }
  const expenseSource = optionalSources.find(source => source.id === 'expenses')
    || { status: 'unavailable', rows: [] }
  const loyaltySource = optionalSources.find(source => source.id === 'loyalty')
    || { status: 'unavailable', rows: [] }
  const messagingSource = optionalSources.find(source => source.id === 'messaging')
    || { status: 'unavailable', rows: [] }
  const paymentSource = optionalSources.find(source => source.id === 'payments')
    || { status: 'unavailable', rows: [] }
  const inventory = normalizeInventory(inventorySource)
  const payments = normalizePayments(paymentSource, finance.netSales)
  const branchPerformance = buildBranchPerformance(branchPnls, finance, branchId)

  const expenseRows = expenseSource.status === 'complete'
    ? expenseSource.rows.filter(row => !branchId || row.cost_centers?.pos_branch_id === branchId)
    : []
  const approvedUnpaidRows = expenseRows.filter(row => row.status === 'approved' && !row.paid_at)
  const loyaltyRows = loyaltySource.status === 'complete' ? loyaltySource.rows : []
  const messagingRows = messagingSource.status === 'complete' ? messagingSource.rows : []
  const { fromIso: periodFromIso } = businessDayWindow(period.from, period.to)
  const periodStart = new Date(periodFromIso)
  const activeLoyalty = loyaltyRows.filter(row => row.last_visit_at && new Date(row.last_visit_at) >= periodStart)
  const newLoyalty = loyaltyRows.filter(row => row.created_at && new Date(row.created_at) >= periodStart)
  const whatsappFailed = messagingRows.filter(row =>
    WHATSAPP_PROBLEM_STATUSES.has(String(row.provider_status || row.status || '').toLowerCase()))
  const whatsappInFlight = messagingRows.filter(row =>
    WHATSAPP_IN_FLIGHT_STATUSES.has(String(row.provider_status || row.status || '').toLowerCase()))
  const revenueChangePct = previousFinance.netSales > 0
    ? ((finance.netSales - previousFinance.netSales) / previousFinance.netSales) * 100
    : null
  const sources = buildSources({ generatedAt, currentPnl, optionalSources })
  const completeness = buildCompleteness({
    currentPnl,
    sources,
    inventory,
    payments,
    branchReconciliation: branchPerformance.reconciliation,
  })

  const insights = [...completeness.issues.map(issue => ({
    id: issue.id,
    type: issue.severity,
    title: issue.title,
    detail: issue.detail,
  }))]
  if (revenueChangePct !== null) {
    insights.push({
      id: 'net_sales_trend',
      type: revenueChangePct >= 0 ? 'good' : 'risk',
      title: revenueChangePct >= 0 ? 'Net sales are up' : 'Net sales are down',
      detail: `${Math.abs(revenueChangePct).toFixed(1)}% vs the previous ${period.days} business days`,
    })
  }
  if (finance.fullyLoadedOperatingProfit < 0) {
    insights.push({
      id: 'fully_loaded_operating_loss',
      type: 'risk',
      title: 'Fully loaded operating loss',
      detail: 'Net sales do not cover product, staff, direct operating, and allocated shared costs.',
    })
  }
  if (approvedUnpaidRows.length > 0) {
    insights.push({
      id: 'approved_expenses_unpaid',
      type: 'warn',
      title: 'Approved expenses need payment',
      detail: `${approvedUnpaidRows.length} approved expense(s) remain unpaid.`,
    })
  }
  if (inventory.lowStockCount > 0) {
    insights.push({
      id: 'inventory_stock_risk',
      type: 'risk',
      title: 'Inventory stock risk',
      detail: `${inventory.lowStockCount} item(s) are below minimum using the best available physical or recipe-backed balance, including ${inventory.outOfStockCount} at zero.`,
    })
  }
  if (whatsappFailed.length > 0) {
    insights.push({
      id: 'whatsapp_delivery_failures',
      type: 'risk',
      title: 'WhatsApp delivery failures',
      detail: `${whatsappFailed.length} message(s) failed or were blocked in this period.`,
    })
  }
  if (insights.length === 0) {
    insights.push({
      id: 'no_material_exceptions',
      type: 'good',
      title: 'No material exceptions',
      detail: 'All reporting sources are available and no configured control threshold is breached.',
    })
  }

  return {
    generatedAt,
    period,
    scope: {
      branchId,
      branchName: branchId
        ? branches.find(branch => branch.id === branchId)?.name || 'Selected branch'
        : 'All branches',
    },
    branches,
    sources,
    completeness,
    payments,
    branchPerformance,
    metrics: {
      ...finance,
      previousNetSales: previousFinance.netSales,
      revenueChangePct,
      approvedUnpaidExpenses: expenseSource.status === 'complete'
        ? approvedUnpaidRows.reduce((sum, row) => sum + expenseAmount(row), 0)
        : null,
      lowStockCount: inventory.lowStockCount,
      outOfStockCount: inventory.outOfStockCount,
      staleStockCount: inventory.staleCount,
      loyaltyCustomers: loyaltySource.status === 'complete' ? loyaltyRows.length : null,
      loyaltyActive: loyaltySource.status === 'complete' ? activeLoyalty.length : null,
      newCustomers: loyaltySource.status === 'complete' ? newLoyalty.length : null,
      whatsappSent: messagingSource.status === 'complete' ? messagingRows.length : null,
      whatsappFailed: messagingSource.status === 'complete' ? whatsappFailed.length : null,
      whatsappQueued: messagingSource.status === 'complete' ? whatsappInFlight.length : null,
    },
    insights: insights.slice(0, 8),
    stockRisk: inventory.rows,
    expenses: expenseRows
      .map(row => ({ ...row, amountLyd: expenseAmount(row) }))
      .sort((left, right) => right.amountLyd - left.amountLyd)
      .slice(0, 8),
    whatsapp: messagingRows.slice(0, 8),
  }
}
