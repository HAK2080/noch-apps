import { supabase } from './supabase'

// ============================================================
// BUSINESS EVENTS
// ============================================================

export async function createBusinessEvent({
  event_type,
  source_module,
  source_id = null,
  branch_id = null,
  customer_id = null,
  product_id = null,
  severity = 'info',
  summary,
  payload = {},
}) {
  const { data, error } = await supabase
    .from('business_events')
    .insert({ event_type, source_module, source_id, branch_id, customer_id, product_id, severity, summary, payload })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listBusinessEvents({ resolved = false, limit = 50, source_module = null } = {}) {
  let q = supabase
    .from('business_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!resolved) q = q.is('resolved_at', null)
  if (source_module) q = q.eq('source_module', source_module)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function resolveBusinessEvent(id) {
  const { data, error } = await supabase
    .from('business_events')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// SUGGESTED ACTIONS
// ============================================================

export async function createSuggestedAction({
  event_id = null,
  action_type,
  title,
  reason,
  target_module,
}) {
  const { data, error } = await supabase
    .from('suggested_actions')
    .insert({ event_id, action_type, title, reason, target_module })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listSuggestedActions({ status = 'suggested', limit = 50 } = {}) {
  let q = supabase
    .from('suggested_actions')
    .select('*, event:business_events(*)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function acceptSuggestedAction(id, updates = {}) {
  const { data, error } = await supabase
    .from('suggested_actions')
    .update({ status: 'accepted', ...updates })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function dismissSuggestedAction(id) {
  const { data, error } = await supabase
    .from('suggested_actions')
    .update({ status: 'dismissed' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function completeSuggestedAction(id, updates = {}) {
  const { data, error } = await supabase
    .from('suggested_actions')
    .update({ status: 'completed', completed_at: new Date().toISOString(), ...updates })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// EVENT PRODUCERS
// Run these on dashboard load to seed relevant signals.
// They are idempotent — they skip events created within 24h
// for the same event_type + source_id combo.
// ============================================================

async function alreadyFired(event_type, source_id) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('business_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', event_type)
    .eq('source_id', source_id)
    .is('resolved_at', null)
    .gte('created_at', since)
  return count > 0
}

async function fire(event, actionDefaults) {
  const skip = event.source_id ? await alreadyFired(event.event_type, event.source_id) : false
  if (skip) return null
  const ev = await createBusinessEvent(event)
  if (actionDefaults) {
    await createSuggestedAction({ event_id: ev.id, ...actionDefaults })
  }
  return ev
}

// Low stock / out of stock inventory
export async function produceLowStockEvents() {
  // Table is 'stock', filter client-side like getDashboardAlerts does
  const { data: allItems } = await supabase
    .from('stock')
    .select('id, qty_available, min_threshold, unit, ingredient:ingredients(name, name_ar)')
    .gt('min_threshold', 0)
    .limit(100)

  const items = (allItems || []).filter(s => s.qty_available < s.min_threshold)
  if (!items.length) return

  for (const item of items) {
    const isOut = item.qty_available <= 0
    const name = item.ingredient?.name || 'Unknown ingredient'
    await fire(
      {
        event_type: isOut ? 'stock_out' : 'stock_low',
        source_module: 'inventory',
        source_id: item.id,
        severity: isOut ? 'urgent' : 'warning',
        summary: isOut
          ? `${name} is out of stock`
          : `${name} is running low (${item.qty_available} ${item.unit} left)`,
        payload: { qty_available: item.qty_available, min_threshold: item.min_threshold, unit: item.unit },
      },
      {
        action_type: 'create_procurement',
        title: `Reorder ${name}`,
        reason: isOut ? `${name} is completely out of stock` : `${name} is below minimum threshold`,
        target_module: 'inventory',
      }
    )
  }
}

// Loyalty at-risk customers
export async function produceLoyaltyAtRiskEvents() {
  const { data: customers } = await supabase
    .from('loyalty_customers')
    .select('id, full_name, nochi_state, last_visit_at')
    .in('nochi_state', ['tired', 'deathbed', 'dead'])
    .limit(20)

  if (!customers?.length) return

  for (const c of customers) {
    await fire(
      {
        event_type: 'loyalty_at_risk',
        source_module: 'loyalty',
        customer_id: c.id,
        source_id: c.id,
        severity: c.nochi_state === 'dead' ? 'urgent' : 'warning',
        summary: `${c.full_name} is at risk — Nochi state: ${c.nochi_state}`,
        payload: { nochi_state: c.nochi_state, last_visit_at: c.last_visit_at },
      },
      {
        action_type: 'queue_message',
        title: `Send comeback message to ${c.full_name}`,
        reason: `${c.full_name} hasn't visited in a while — Nochi state is ${c.nochi_state}`,
        target_module: 'loyalty',
      }
    )
  }
}

// Negative feedback
export async function produceNegativeFeedbackEvents() {
  const { data: feedback } = await supabase
    .from('loyalty_feedback')
    .select('id, customer_id, rating, comment, created_at')
    .lte('rating', 2)
    .eq('actioned', false)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(10)

  if (!feedback?.length) return

  for (const f of feedback) {
    await fire(
      {
        event_type: 'negative_feedback',
        source_module: 'loyalty',
        source_id: f.id,
        customer_id: f.customer_id,
        severity: f.rating <= 1 ? 'critical' : 'urgent',
        summary: `${f.rating}★ feedback received${f.comment ? `: "${f.comment}"` : ''}`,
        payload: { rating: f.rating, comment: f.comment },
      },
      {
        action_type: 'create_task',
        title: 'Follow up on negative feedback',
        reason: `Customer left a ${f.rating}-star review that needs a personal response`,
        target_module: 'loyalty',
      }
    )
  }
}

// Pending online orders (older than 30 min) — same table as getDashboardAlerts
export async function producePendingOrderEvents() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: orders } = await supabase
    .from('pos_orders')
    .select('id, customer_name, order_number, total, created_at, branch:pos_branches(name)')
    .eq('is_guest', true)
    .eq('source', 'online')
    .eq('status', 'pending')
    .lte('created_at', cutoff)
    .limit(10)

  if (!orders?.length) return

  for (const o of orders) {
    const mins = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000)
    await fire(
      {
        event_type: 'pending_order',
        source_module: 'pos',
        source_id: o.id,
        severity: mins > 60 ? 'urgent' : 'warning',
        summary: `Order ${o.order_number} from ${o.customer_name} pending for ${mins} min`,
        payload: { order_number: o.order_number, total: o.total, minutes_pending: mins },
      },
      {
        action_type: 'notify_staff',
        title: `Process order ${o.order_number}`,
        reason: `Order has been pending for ${mins} minutes`,
        target_module: 'pos',
      }
    )
  }
}

// Urgent overdue tasks
export async function produceOverdueTaskEvents() {
  const today = new Date().toISOString().split('T')[0]
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, priority, status')
    .lt('due_date', today)
    .not('status', 'in', '("done","completed","approved")')
    .in('priority', ['urgent', 'high'])
    .limit(10)

  if (!tasks?.length) return

  for (const task of tasks) {
    await fire(
      {
        event_type: 'task_overdue',
        source_module: 'tasks',
        source_id: task.id,
        severity: task.priority === 'urgent' ? 'critical' : 'urgent',
        summary: `Task "${task.title}" is overdue (due ${task.due_date})`,
        payload: { due_date: task.due_date, priority: task.priority, status: task.status },
      },
      {
        action_type: 'create_task',
        title: `Review overdue: ${task.title}`,
        reason: `High-priority task overdue since ${task.due_date}`,
        target_module: 'tasks',
      }
    )
  }
}

// Run all producers in parallel — call from dashboard on load
export async function runAllEventProducers() {
  await Promise.allSettled([
    produceLowStockEvents(),
    produceLoyaltyAtRiskEvents(),
    produceNegativeFeedbackEvents(),
    producePendingOrderEvents(),
    produceOverdueTaskEvents(),
  ])
}
