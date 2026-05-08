// finance-supabase.js — all Finance module data access.
// Reads from migrations 20260508010000_finance_mvp.sql.

import { supabase } from '../../../lib/supabase'

// ── Settings (singleton row id='default') ──────────────────────────────
export async function getFinanceSettings() {
  const { data, error } = await supabase
    .from('finance_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw error
  return data || {}
}

export async function updateFinanceSettings(updates) {
  const payload = { id: 'default', ...updates, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('finance_settings')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── P&L RPC ──────────────────────────────────────────────────────────
export async function getPnL({ branchId = null, from, to }) {
  const { data, error } = await supabase.rpc('finance_pnl', {
    p_branch_id: branchId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data || {}
}

// ── Menu Profitability Matrix RPC ───────────────────────────────────
export async function getMenuMatrix({ branchId = null, from, to }) {
  const { data, error } = await supabase.rpc('finance_menu_matrix', {
    p_branch_id: branchId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data || []
}

// ── Cash & runway ───────────────────────────────────────────────────
export async function getCashRunway(branchId = null) {
  const { data, error } = await supabase.rpc('finance_cash_runway', {
    p_branch_id: branchId,
  })
  if (error) throw error
  return data || {}
}

// ── Expenses ────────────────────────────────────────────────────────
export async function listExpenses({ branchId = null, from, to } = {}) {
  let q = supabase.from('expense_entries').select('*').order('paid_at', { ascending: false })
  if (branchId) q = q.eq('branch_id', branchId)
  if (from) q = q.gte('paid_at', from)
  if (to)   q = q.lte('paid_at', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createExpense(expense) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const payload = { ...expense, created_by: user?.id }
  const { data, error } = await supabase.from('expense_entries').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateExpense(id, updates) {
  const { data, error } = await supabase
    .from('expense_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expense_entries').delete().eq('id', id)
  if (error) throw error
}

// ── Shifts (read from existing pos_shift_attendees + pos_shifts + view) ──
export async function listShiftLabor({ branchId = null, from, to } = {}) {
  let q = supabase.from('shift_labor_cost')
    .select('*, profiles!user_id(full_name, photo_url)')
    .order('clocked_in_at', { ascending: false })
  if (branchId) q = q.eq('branch_id', branchId)
  if (from) q = q.gte('clocked_in_at', `${from}T00:00:00`)
  if (to)   q = q.lte('clocked_in_at', `${to}T23:59:59`)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// Update an attendee's clock_in/out or rate override.
export async function updateAttendee(id, updates) {
  const { data, error } = await supabase
    .from('pos_shift_attendees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Update a profile's hourly rate (owner only via RLS).
export async function setHourlyRate(userId, rate) {
  const { error } = await supabase
    .from('profiles')
    .update({ hourly_rate_lyd: Number(rate) })
    .eq('id', userId)
  if (error) throw error
}

// ── Recipe linker ───────────────────────────────────────────────────
export async function listProductsForLinking() {
  const { data, error } = await supabase
    .from('pos_products')
    .select('id, name, name_ar, price, recipe_id, is_active, visible_on_menu, branch_id')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}

export async function listRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, code, name, name_ar, category, subcategory')
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return data || []
}

export async function setProductRecipe(productId, recipeId) {
  const { error } = await supabase
    .from('pos_products')
    .update({ recipe_id: recipeId, updated_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw error
}

// ── Bank ────────────────────────────────────────────────────────────
export async function listBankTransactions({ accountLabel = null, from, to } = {}) {
  let q = supabase.from('bank_transactions').select('*').order('posted_at', { ascending: false })
  if (accountLabel) q = q.eq('account_label', accountLabel)
  if (from) q = q.gte('posted_at', from)
  if (to)   q = q.lte('posted_at', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function bulkInsertBankTransactions(rows) {
  // Conflict on the dedupe unique index → upsert via insert with onConflict.
  const { data, error } = await supabase
    .from('bank_transactions')
    .upsert(rows, { onConflict: 'account_label,posted_at,amount_lyd,description', ignoreDuplicates: true })
    .select()
  if (error) throw error
  return data || []
}

export async function updateBankTransactionCategory(id, category) {
  const { error } = await supabase
    .from('bank_transactions')
    .update({ category, category_source: 'manual' })
    .eq('id', id)
  if (error) throw error
}

// ── Branches (re-exported convenience) ──────────────────────────────
export async function listBranches() {
  const { data, error } = await supabase
    .from('pos_branches')
    .select('id, name, name_ar, is_active')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  // Filter out Bloom for v1 per finance plan.
  return (data || []).filter(b => !/^bloom/i.test(b.name))
}
