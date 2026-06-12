// ops-supabase.js — all Ops Checklist data access.
// Backed by 20260612040000_ops_checklist_module.sql.

import { supabase } from '../../../lib/supabase'

// ── SETTINGS (singleton row id='default') ───────────────────────────────
export async function getOpsSettings() {
  const { data, error } = await supabase
    .from('ops_settings').select('*').eq('id', 'default').maybeSingle()
  if (error) {
    // Migration not applied yet → treat module as disabled.
    if (error.code === '42P01' || error.message?.includes('does not exist')) return null
    throw error
  }
  return data
}

export async function updateOpsSettings(updates) {
  const payload = { id: 'default', ...updates, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('ops_settings').upsert(payload, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data
}

// ── SHIFT WINDOWS ───────────────────────────────────────────────────────
export async function listShiftWindows({ activeOnly = false } = {}) {
  let q = supabase.from('ops_shift_windows').select('*').order('sort_order').order('start_time')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) return []
  return data || []
}

export async function upsertShiftWindow(row) {
  const payload = { ...row, updated_at: new Date().toISOString() }
  if (payload.id) {
    const { data, error } = await supabase.from('ops_shift_windows').update(payload).eq('id', payload.id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('ops_shift_windows').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteShiftWindow(id) {
  const { error } = await supabase.from('ops_shift_windows').delete().eq('id', id)
  if (error) throw error
}

// ── INVENTORY ITEMS ─────────────────────────────────────────────────────
export async function listInventoryItems({ activeOnly = false } = {}) {
  let q = supabase.from('ops_inventory_items').select('*').order('name_en')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) return []
  return data || []
}

export async function upsertInventoryItem(row) {
  const payload = { ...row, updated_at: new Date().toISOString() }
  if (payload.id) {
    const { data, error } = await supabase.from('ops_inventory_items').update(payload).eq('id', payload.id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('ops_inventory_items').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteInventoryItem(id) {
  const { error } = await supabase.from('ops_inventory_items').delete().eq('id', id)
  if (error) throw error
}

// ── TASK TEMPLATES ──────────────────────────────────────────────────────
export async function listTaskTemplates({ activeOnly = false } = {}) {
  let q = supabase.from('ops_task_templates')
    .select('*, window:ops_shift_windows(*), item:ops_inventory_items(*)')
    .order('sort_order')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) return []
  return data || []
}

export async function upsertTaskTemplate(row) {
  const payload = { ...row, updated_at: new Date().toISOString() }
  // Strip joined objects if caller forgot
  delete payload.window
  delete payload.item
  if (payload.id) {
    const { data, error } = await supabase.from('ops_task_templates').update(payload).eq('id', payload.id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('ops_task_templates').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function deleteTaskTemplate(id) {
  const { error } = await supabase.from('ops_task_templates').delete().eq('id', id)
  if (error) throw error
}

// ── TASK INSTANCES ──────────────────────────────────────────────────────
// Today's instances for the checklist (and for "any pending in current window").
export async function listInstancesForDate(businessDate) {
  const { data, error } = await supabase
    .from('ops_task_instances')
    .select('*, template:ops_task_templates(*, window:ops_shift_windows(*), item:ops_inventory_items(*)), completed_by_profile:profiles!completed_by(id, full_name)')
    .eq('business_date', businessDate)
  if (error) return []
  return data || []
}

// Ensure today's instances exist client-side. Edge function runs on cron,
// but a manager opening the checklist on a fresh day before cron should
// still see the list. Calls the same SECURITY DEFINER RPC.
export async function ensureInstancesForToday(businessDate) {
  const { data, error } = await supabase.rpc('ops_generate_instances_for', { p_business_date: businessDate })
  if (error) {
    // Module disabled in DB → RPC returns nothing; not an error.
    if (error.code === '42883') return []
    throw error
  }
  return data || []
}

export async function completeInstance(instanceId, { value_recorded = null, profileId = null } = {}) {
  const payload = {
    status: 'done',
    value_recorded,
    completed_by: profileId,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('ops_task_instances').update(payload).eq('id', instanceId).select().single()
  if (error) throw error
  return data
}

export async function skipInstance(instanceId, profileId = null) {
  const { data, error } = await supabase
    .from('ops_task_instances').update({
      status: 'skipped', completed_by: profileId, completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', instanceId).select().single()
  if (error) throw error
  return data
}

// ── RESTOCK ALERTS ──────────────────────────────────────────────────────
export async function listOpenRestockAlerts() {
  const { data, error } = await supabase
    .from('ops_restock_alerts')
    .select('*, item:ops_inventory_items(*)')
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
  if (error) return []
  return data || []
}

export async function ackRestockAlert(alertId, profileId = null) {
  const { error } = await supabase
    .from('ops_restock_alerts')
    .update({ acknowledged_by: profileId, acknowledged_at: new Date().toISOString() })
    .eq('id', alertId)
  if (error) throw error
}

// ── 7-DAY COMPLETION RATE per shift window ──────────────────────────────
export async function completionRateLast7Days() {
  const since = new Date()
  since.setDate(since.getDate() - 6)
  const sinceStr = since.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('ops_task_instances')
    .select('status, template:ops_task_templates(shift_window_id, window:ops_shift_windows(name_en, name_ar))')
    .gte('business_date', sinceStr)
  if (error) return []
  const by = {}
  for (const row of data || []) {
    const w = row.template?.window
    if (!w) continue
    const key = row.template.shift_window_id
    by[key] = by[key] || { name_en: w.name_en, name_ar: w.name_ar, total: 0, done: 0 }
    by[key].total++
    if (row.status === 'done') by[key].done++
  }
  return Object.values(by).map(w => ({ ...w, rate: w.total > 0 ? w.done / w.total : null }))
}

// ── HELPERS ─────────────────────────────────────────────────────────────
export function todayInTz(tz = 'Africa/Tripoli') {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date())
}

// Returns "HH:MM" in the given tz (used to pick the current shift window).
export function nowHMInTz(tz = 'Africa/Tripoli') {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  return fmt.format(new Date())
}

// "HH:MM" → minutes since midnight (handles end-time '23:59' inclusively).
function hmToMin(hm) {
  if (!hm) return null
  const [h, m] = String(hm).slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

// Returns the active shift window for "now", or null. Honours sort_order
// as tiebreaker when windows overlap.
export function currentShiftWindow(windows, tz = 'Africa/Tripoli') {
  const now = hmToMin(nowHMInTz(tz))
  const candidates = (windows || []).filter(w => {
    const s = hmToMin(w.start_time), e = hmToMin(w.end_time)
    if (s == null || e == null) return false
    if (s <= e) return now >= s && now <= e
    // Window crosses midnight (e.g. 22:00–02:00).
    return now >= s || now <= e
  }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return candidates[0] || null
}
