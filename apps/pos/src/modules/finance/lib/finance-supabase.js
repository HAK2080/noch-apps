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
export async function getPnL({ branchId = null, from, to, netOfRefunds = false }) {
  const { data, error } = await supabase.rpc('finance_pnl', {
    p_branch_id: branchId,
    p_from: from,
    p_to: to,
    p_net_of_refunds: netOfRefunds,
  })
  if (error) throw error
  return data || {}
}

// ── Variance vs budget ──────────────────────────────────────────────
export async function getVariance({ branchId = null, periodMonth }) {
  const { data, error } = await supabase.rpc('finance_variance', {
    p_branch_id: branchId,
    p_period_month: periodMonth,
  })
  if (error) throw error
  return data || []
}

// ── Budgets ─────────────────────────────────────────────────────────
export async function listBudgets({ periodMonth, branchId = null } = {}) {
  let q = supabase.from('finance_budgets').select('*').order('category')
  if (periodMonth) q = q.eq('period_month', periodMonth)
  if (branchId)    q = q.eq('branch_id', branchId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
export async function upsertBudget(row) {
  const { data, error } = await supabase
    .from('finance_budgets')
    .upsert(row, { onConflict: 'branch_id,period_month,category' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── CapEx ───────────────────────────────────────────────────────────
export async function listCapex() {
  const { data, error } = await supabase
    .from('finance_capex')
    .select('*')
    .order('acquired_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function createCapex(row) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('finance_capex')
    .insert({ ...row, created_by: user?.id })
    .select().single()
  if (error) throw error
  return data
}
export async function updateCapex(id, updates) {
  const { data, error } = await supabase
    .from('finance_capex')
    .update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Forecast / scenarios ────────────────────────────────────────────
export async function runForecast({ branchId = null, baselineFrom, baselineTo, horizonDays = 90, matchaCostDelta = 0, salesVolumeDelta = 0, laborHeadcountDelta = 0 }) {
  const { data, error } = await supabase.rpc('finance_forecast', {
    p_branch_id: branchId,
    p_baseline_from: baselineFrom,
    p_baseline_to: baselineTo,
    p_horizon_days: horizonDays,
    p_matcha_cost_pct_delta: matchaCostDelta,
    p_sales_volume_pct_delta: salesVolumeDelta,
    p_labor_headcount_delta: laborHeadcountDelta,
  })
  if (error) throw error
  return data || {}
}
export async function listScenarios() {
  const { data, error } = await supabase.from('finance_scenarios').select('*').order('saved_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function saveScenario(row) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('finance_scenarios').insert({ ...row, saved_by: user?.id }).select().single()
  if (error) throw error
  return data
}

// ── OCR invoice ────────────────────────────────────────────────────
export async function ocrInvoice(file) {
  const b64 = await fileToBase64(file)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-invoice`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ image_base64: b64, mime_type: file.type || 'image/jpeg' }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'OCR failed')
  return json.data
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = r.result
      const idx = s.indexOf(',')
      resolve(idx >= 0 ? s.slice(idx + 1) : s)
    }
    r.onerror = reject
    r.readAsDataURL(file)
  })
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

// ── Cost mapping (was Recipe linker; pivoted 2026-05-08 to direct
//    pos_products.cost_lyd entry — see RecipeLinkerTab.jsx header). ──
export async function listProductsForLinking() {
  const { data, error } = await supabase
    .from('pos_products')
    .select('id, name, name_ar, price, cost_lyd, is_active, branch_id')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}
export async function setProductCost(productId, costLyd) {
  const { error } = await supabase
    .from('pos_products')
    .update({ cost_lyd: Number(costLyd), updated_at: new Date().toISOString() })
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
