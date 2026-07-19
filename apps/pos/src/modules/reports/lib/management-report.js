import { supabase } from '../../../lib/supabase'

const localDateKey = (date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const safeRows = async (query, fallback = []) => {
  try {
    const { data, error } = await query
    if (error) return fallback
    return data || fallback
  } catch {
    return fallback
  }
}

export async function getManagementReport({ days = 7, branchId = null } = {}) {
  const periodDays = Number(days) || 7
  const to = new Date()
  const from = new Date(to)
  from.setDate(to.getDate() - (periodDays - 1))
  from.setHours(0, 0, 0, 0)

  const prevTo = new Date(from)
  prevTo.setMilliseconds(-1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevTo.getDate() - (periodDays - 1))
  prevFrom.setHours(0, 0, 0, 0)

  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const prevFromIso = prevFrom.toISOString()
  const prevToIso = prevTo.toISOString()
  const fromDate = localDateKey(from)
  const toDate = localDateKey(to)

  let ordersQuery = supabase
    .from('pos_orders')
    .select('id, total, subtotal, discount_amount, status, payment_method, created_at, loyalty_customer_id')
    .eq('status', 'completed')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
  let previousOrdersQuery = supabase
    .from('pos_orders')
    .select('id, total, status, created_at')
    .eq('status', 'completed')
    .gte('created_at', prevFromIso)
    .lte('created_at', prevToIso)
  if (branchId) {
    ordersQuery = ordersQuery.eq('branch_id', branchId)
    previousOrdersQuery = previousOrdersQuery.eq('branch_id', branchId)
  }

  const [orders, prevOrders, allExpenses, stock, customers, outbox, branches] = await Promise.all([
    safeRows(ordersQuery),
    safeRows(previousOrdersQuery),
    safeRows(
      supabase
        .from('expenses')
        .select('id, amount, amount_lyd, exchange_rate_to_lyd, status, expense_date, paid_at, vendor, description, cost_centers(pos_branch_id), expense_categories(name, finance_class)')
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate)
    ),
    safeRows(
      supabase
        .from('stock')
        .select('id, qty_available, min_threshold, unit, ingredient:ingredients(name, name_ar, category)')
        .order('qty_available', { ascending: true })
    ),
    safeRows(supabase.from('loyalty_customers').select('id, created_at, last_visit_at, whatsapp_opt_in, nochi_state')),
    safeRows(
      supabase
        .from('notification_outbox')
        .select('id, status, provider_status, channel, template_key, created_at')
        .eq('channel', 'whatsapp')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
    ),
    safeRows(supabase.from('pos_branches').select('id, name').eq('is_active', true).order('name')),
  ])

  const expenses = branchId
    ? allExpenses.filter(row => row.cost_centers?.pos_branch_id === branchId)
    : allExpenses

  const money = (value) => Number(value || 0)
  const expenseAmount = (row) => money(row.amount_lyd ?? (money(row.amount) * money(row.exchange_rate_to_lyd || 1)))
  const revenue = orders.reduce((sum, row) => sum + money(row.total), 0)
  const grossRevenue = orders.reduce((sum, row) => sum + Math.max(0, money(row.total)), 0)
  const revenueAdjustments = orders.reduce((sum, row) => sum + Math.min(0, money(row.total)), 0)
  const prevRevenue = prevOrders.reduce((sum, row) => sum + money(row.total), 0)
  const expenseRows = expenses.filter(row => row.status !== 'rejected')
  const expenseTotal = expenseRows.reduce((sum, row) => sum + expenseAmount(row), 0)
  const opexRows = expenseRows.filter(row => (row.expense_categories?.finance_class || 'opex') === 'opex')
  const capexRows = expenseRows.filter(row => row.expense_categories?.finance_class === 'capex')
  const prepaidRows = expenseRows.filter(row => row.expense_categories?.finance_class === 'prepaid')
  const operatingExpenses = opexRows.reduce((sum, row) => sum + expenseAmount(row), 0)
  const paidExpenses = expenses.filter(row => row.status === 'paid')
  const approvedUnpaidExpenses = expenses.filter(row => row.status === 'approved' && !row.paid_at)
  const lowStock = stock.filter(row => money(row.min_threshold) > 0 && money(row.qty_available) < money(row.min_threshold))
  const outOfStock = lowStock.filter(row => money(row.qty_available) <= 0)
  const recentCustomers = customers.filter(row => row.last_visit_at && new Date(row.last_visit_at) >= from)
  const newCustomers = customers.filter(row => row.created_at && new Date(row.created_at) >= from)
  const whatsappProblemStatuses = ['failed', 'undelivered', 'error', 'cooldown_recent_send', 'not_opted_in', 'missing_template_sid']
  const whatsappFailed = outbox.filter(row => whatsappProblemStatuses.includes(String(row.provider_status || row.status || '').toLowerCase()))
  const whatsappQueued = outbox.filter(row => ['queued', 'pending', 'claimed', 'sent'].includes(String(row.provider_status || row.status || '').toLowerCase()))
  const revenueChangePct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null

  const insights = []
  if (revenueChangePct !== null) {
    insights.push({
      type: revenueChangePct >= 0 ? 'good' : 'risk',
      title: revenueChangePct >= 0 ? 'Sales are up' : 'Sales are down',
      detail: `${Math.abs(revenueChangePct).toFixed(1)}% vs previous ${periodDays} days`,
    })
  }
  if (approvedUnpaidExpenses.length > 0) {
    insights.push({ type: 'warn', title: 'Approved expenses need payment', detail: `${approvedUnpaidExpenses.length} unpaid approved expenses` })
  }
  if (lowStock.length > 0) {
    insights.push({ type: 'risk', title: 'Stock risk', detail: `${lowStock.length} items below minimum, ${outOfStock.length} out of stock` })
  }
  if (whatsappFailed.length > 0) {
    insights.push({ type: 'risk', title: 'WhatsApp delivery failures', detail: `${whatsappFailed.length} failed messages in this period` })
  }
  if (insights.length === 0) {
    insights.push({ type: 'good', title: 'No critical management alerts', detail: 'Sales, costs, stock, and messaging have no obvious red flags in this period' })
  }

  return {
    period: { days: periodDays, from: fromDate, to: toDate },
    scope: {
      branchId,
      branchName: branchId ? branches.find(branch => branch.id === branchId)?.name || 'Selected branch' : 'All branches',
    },
    branches,
    metrics: {
      revenue,
      grossRevenue,
      revenueAdjustments,
      previousRevenue: prevRevenue,
      revenueChangePct,
      orders: orders.length,
      averageTicket: orders.length ? revenue / orders.length : 0,
      expenses: expenseTotal,
      operatingExpenses,
      capitalExpenses: capexRows.reduce((sum, row) => sum + expenseAmount(row), 0),
      prepaidExpenses: prepaidRows.reduce((sum, row) => sum + expenseAmount(row), 0),
      paidExpenses: paidExpenses.reduce((sum, row) => sum + expenseAmount(row), 0),
      approvedUnpaidExpenses: approvedUnpaidExpenses.reduce((sum, row) => sum + expenseAmount(row), 0),
      netAfterExpenses: revenue - operatingExpenses,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      loyaltyCustomers: customers.length,
      loyaltyActive: recentCustomers.length,
      newCustomers: newCustomers.length,
      whatsappSent: outbox.length,
      whatsappFailed: whatsappFailed.length,
      whatsappQueued: whatsappQueued.length,
    },
    insights,
    stockRisk: lowStock.slice(0, 8),
    expenses: expenseRows.sort((a, b) => expenseAmount(b) - expenseAmount(a)).slice(0, 8),
    whatsapp: outbox.slice(0, 8),
  }
}
