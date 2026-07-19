// expensesData.js — Expenses module: formatting helpers + DB access
import { supabase } from '../../../lib/supabase'
import { formatCurrency } from '../../../lib/numbers'

// ── Formatting ──────────────────────────────────────────────
export const fmt = (n, currency = 'LYD') => formatCurrency(n || 0, currency, 2)

// Fall back to amount when amount_lyd wasn't populated (older records)
export const amtLyd = (e) => e.amount_lyd ?? ((e.amount || 0) * (e.exchange_rate_to_lyd || 1))

// ── DB helpers ──────────────────────────────────────────────
export async function loadCostCenters() {
  const { data } = await supabase.from('cost_centers').select('*').order('id')
  return data || []
}
export async function loadCategories() {
  const { data } = await supabase.from('expense_categories').select('*').order('name')
  return data || []
}
export async function loadRates() {
  const { data } = await supabase.from('currency_rates').select('*').order('currency')
  return data || []
}
export async function loadExpenses(filter = {}) {
  let q = supabase
    .from('expenses')
    .select(`*, cost_centers(id,name), expense_categories(id,name), profiles!expenses_submitted_by_fkey(full_name)`)
    .order('submitted_at', { ascending: false })
  if (filter.userId) q = q.eq('submitted_by', filter.userId)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.ccId)   q = q.eq('cost_center_id', filter.ccId)
  const { data } = await q
  return data || []
}
export async function loadApprovals(expenseIds) {
  if (!expenseIds.length) return []
  const { data } = await supabase.from('expense_approvals')
    .select('*, profiles(full_name)')
    .in('expense_id', expenseIds)
    .order('acted_at', { ascending: false })
  return data || []
}
export async function deleteExpense(id) {
  await supabase.from('expense_approvals').delete().eq('expense_id', id)
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
export async function uploadReceipt(userId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage.from('expense-receipts').upload(path, file, { upsert: false })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('expense-receipts').getPublicUrl(data.path)
  return publicUrl
}
export async function getOwnerSetting(key, fallback = null) {
  const { data } = await supabase.from('owner_settings').select('value').eq('key', key).maybeSingle()
  return data ? data.value : fallback
}
export async function setOwnerSetting(key, value) {
  await supabase.from('owner_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}
