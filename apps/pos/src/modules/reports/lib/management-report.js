import { supabase } from '../../../lib/supabase'
import { getPnL, listBranches } from '../../finance/lib/finance-supabase'
import { businessDayWindow } from '../../pos/lib/business-time'
import { buildManagementReport } from './management-report-model'
import { rollingBusinessPeriod } from './reporting-periods'

const SOURCE_DEFINITIONS = {
  payments: {
    label: 'Payment reconciliation',
    scope: 'Selected report scope',
  },
  inventory: {
    label: 'Inventory control',
    scope: 'Tracked ingredient stock · not branch-filtered',
  },
  expenses: {
    label: 'Expense details',
    scope: 'Selected report scope',
  },
  loyalty: {
    label: 'Loyalty membership',
    scope: 'All branches',
  },
  messaging: {
    label: 'WhatsApp delivery',
    scope: 'All branches',
  },
}

async function queryRows(query) {
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function loadOptionalSource(id, query) {
  const definition = SOURCE_DEFINITIONS[id]
  try {
    const rows = await queryRows(query)
    return {
      id,
      label: definition.label,
      scope: definition.scope,
      status: 'complete',
      rows,
      error: null,
    }
  } catch (error) {
    return {
      id,
      label: definition.label,
      scope: definition.scope,
      status: 'unavailable',
      rows: null,
      error: error?.message || 'Source unavailable',
    }
  }
}

export async function getManagementReport({
  days = 7,
  branchId = null,
  now = new Date(),
} = {}) {
  const period = rollingBusinessPeriod(days, now)
  const generatedAt = new Date().toISOString()
  const { from, to, previousFrom, previousTo } = period
  const { fromIso, toIso } = businessDayWindow(from, to)

  const [currentPnl, previousPnl, branches] = await Promise.all([
    getPnL({ branchId, from, to, netOfRefunds: true }),
    getPnL({ branchId, from: previousFrom, to: previousTo, netOfRefunds: true }),
    listBranches(),
  ])

  const [branchPnls, ...optionalSources] = await Promise.all([
    Promise.all(
      branches.map(async branch => ({
        branch,
        pnl: await getPnL({ branchId: branch.id, from, to, netOfRefunds: true }),
      })),
    ),
    loadOptionalSource(
      'payments',
      supabase.rpc('finance_payment_reconciliation', {
        p_branch_id: branchId,
        p_from: from,
        p_to: to,
      }),
    ),
    loadOptionalSource('inventory', supabase.rpc('inventory_theoretical_status')),
    loadOptionalSource(
      'expenses',
      supabase
        .from('expenses')
        .select('id, amount, amount_lyd, exchange_rate_to_lyd, status, expense_date, paid_at, updated_at, vendor, description, cost_centers(pos_branch_id), expense_categories(name, finance_class)')
        .in('status', ['approved', 'paid'])
        .gte('expense_date', from)
        .lte('expense_date', to),
    ),
    loadOptionalSource(
      'loyalty',
      supabase
        .from('loyalty_customers')
        .select('id, created_at, last_visit_at, whatsapp_opt_in, nochi_state'),
    ),
    loadOptionalSource(
      'messaging',
      supabase
        .from('notification_outbox')
        .select('id, status, provider_status, channel, template_key, created_at')
        .eq('channel', 'whatsapp')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false }),
    ),
  ])

  return buildManagementReport({
    period,
    branchId,
    branches,
    currentPnl,
    previousPnl,
    branchPnls,
    optionalSources,
    generatedAt,
  })
}
