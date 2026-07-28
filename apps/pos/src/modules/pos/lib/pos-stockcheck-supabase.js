// pos-stockcheck-supabase.js — Weekly stock check domain
// Extracted from pos-supabase.js (STOCK CHECK section). Follows exact pattern from src/lib/supabase.js

import { supabase } from '../../../lib/supabase'

const PRIORITY_ORDER = { critical: 0, important: 1, low: 2 }

export async function getStockCheckItems(branchId) {
  const { data, error } = await supabase
    .from('stock_check_items')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data || []).sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) ||
    a.sort_order - b.sort_order
  )
}

export async function getLatestStockEntries(branchId) {
  // Fetch all entries for this branch, then keep only the latest per item
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('*')
    .eq('branch_id', branchId)
    .order('checked_at', { ascending: false })
  if (error) throw error
  const map = {}
  for (const entry of data || []) {
    if (!map[entry.item_id]) map[entry.item_id] = entry
  }
  return map  // { item_id: entry }
}

export async function hasCheckThisWeek(branchId) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('id')
    .eq('branch_id', branchId)
    .gte('checked_at', monday.toISOString())
    .limit(1)
  if (error) return false
  return (data || []).length > 0
}

export async function getLastCheckInfo(branchId) {
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('checked_at, checked_by, profiles!checked_by(full_name)')
    .eq('branch_id', branchId)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return {
    checked_at: data.checked_at,
    checked_by_name: data.profiles?.full_name || null,
  }
}

export async function saveStockCheckSession(branchId, entries, userId) {
  // entries: [{ item_id, status, qty, unit, note }]
  const rows = entries.map(e => ({
    branch_id: branchId,
    item_id: e.item_id,
    status: e.status,
    qty: e.qty || null,
    unit: e.unit || null,
    note: e.note || null,
    checked_by: userId,
    checked_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('stock_check_entries').insert(rows)
  if (error) throw error
}

export async function createStockCheckItem(data) {
  const { data: result, error } = await supabase
    .from('stock_check_items')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return result
}

export async function updateStockCheckItem(id, updates) {
  const { data, error } = await supabase
    .from('stock_check_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStockCheckItem(id) {
  const { error } = await supabase
    .from('stock_check_items')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

export async function getStockCheckReminder(branchId) {
  const { data, error } = await supabase
    .from('stock_check_reminders')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle()
  if (error) return null
  return data
}

export async function upsertStockCheckReminder(branchId, updates) {
  const { error } = await supabase
    .from('stock_check_reminders')
    .upsert({ branch_id: branchId, ...updates, updated_at: new Date().toISOString() },
             { onConflict: 'branch_id' })
  if (error) throw error
}

// ── All-locations stock check ──────────────────────────────────

export async function getAllStockCheckItems() {
  const { data, error } = await supabase
    .from('stock_check_items')
    .select('*, pos_branches(id, name)')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data || [])
    .map(item => ({ ...item, branch_name: item.pos_branches?.name || '' }))
    .sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) ||
      a.sort_order - b.sort_order
    )
}

export async function getAllLatestStockEntries() {
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('*')
    .order('checked_at', { ascending: false })
  if (error) throw error
  const map = {}
  for (const entry of data || []) {
    if (!map[entry.item_id]) map[entry.item_id] = entry
  }
  return map
}

export async function bulkSaveStockEntries(entries, userId) {
  // entries: [{ item_id, branch_id, status, qty, unit, note }]
  const rows = entries.map(e => ({
    branch_id: e.branch_id,
    item_id:   e.item_id,
    status:    e.status,
    qty:       e.qty || null,
    unit:      e.unit || null,
    note:      e.note || null,
    checked_by:  userId,
    checked_at:  new Date().toISOString(),
  }))
  const { error } = await supabase.from('stock_check_entries').insert(rows)
  if (error) throw error
}
