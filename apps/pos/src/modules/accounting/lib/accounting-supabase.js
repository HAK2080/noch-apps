// accounting-supabase.js - all GL data access (chart of accounts, journals,
// ledger, trial balance, statements, posting). Mirrors finance-supabase.js.

import { supabase } from '../../../lib/supabase'

// Settings
export async function getGlSettings() {
  const { data, error } = await supabase.from('gl_settings').select('*').eq('id', 'default').maybeSingle()
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return null
    throw error
  }
  return data
}
export async function updateGlSettings(updates) {
  const { data, error } = await supabase.from('gl_settings')
    .upsert({ id: 'default', ...updates, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select().single()
  if (error) throw error
  return data
}

// Chart of accounts
export async function listAccounts({ activeOnly = false } = {}) {
  let q = supabase.from('gl_accounts').select('*').order('code')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) return []
  return data || []
}
export async function upsertAccount(row) {
  const payload = { ...row }
  if (payload.id) {
    const { data, error } = await supabase.from('gl_accounts').update(payload).eq('id', payload.id).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('gl_accounts').insert(payload).select().single()
  if (error) throw error
  return data
}
export async function deactivateAccount(id) {
  const { error } = await supabase.from('gl_accounts').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// Account map
export async function listAccountMap() {
  const { data, error } = await supabase.from('gl_account_map').select('*, account:gl_accounts(code, name_en, name_ar)').order('key')
  if (error) return []
  return data || []
}
export async function setAccountMap(key, accountId) {
  const { error } = await supabase.from('gl_account_map').update({ account_id: accountId }).eq('key', key)
  if (error) throw error
}

// Journal batches + lines
export async function listBatches({ from, to, branchId = null, sourceType = null } = {}) {
  let q = supabase.from('gl_journal_batches')
    .select('*, branch:pos_branches(name)')
    .order('journal_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (from) q = q.gte('journal_date', from)
  if (to) q = q.lte('journal_date', to)
  if (branchId) q = q.eq('branch_id', branchId)
  if (sourceType) q = q.eq('source_type', sourceType)
  const { data, error } = await q
  if (error) return []
  return data || []
}
export async function getBatchLines(batchId) {
  const { data, error } = await supabase.from('gl_journal_lines')
    .select('*, account:gl_accounts(code, name_en, name_ar)')
    .eq('batch_id', batchId).order('line_no')
  if (error) return []
  return data || []
}

// Create a manual balanced journal. lines: [{ account_id, debit_lyd, credit_lyd, memo }]
export async function createManualJournal({ journal_date, branch_id = null, memo, lines }) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const td = lines.reduce((s, l) => s + Number(l.debit_lyd || 0), 0)
  const tc = lines.reduce((s, l) => s + Number(l.credit_lyd || 0), 0)
  if (Math.round(td * 100) !== Math.round(tc * 100)) {
    throw new Error(`Not balanced - debit ${td.toFixed(2)} != credit ${tc.toFixed(2)}`)
  }
  if (td === 0) throw new Error('Journal has no amounts')

  const { data: batch, error: be } = await supabase.from('gl_journal_batches')
    .insert({ journal_date, source_type: 'manual', branch_id, memo, status: 'draft', created_by: user?.id })
    .select().single()
  if (be) throw be

  const rows = lines
    .filter(l => Number(l.debit_lyd || 0) > 0 || Number(l.credit_lyd || 0) > 0)
    .map((l, i) => ({
      batch_id: batch.id,
      account_id: l.account_id,
      branch_id,
      line_no: i + 1,
      debit_lyd: Number(l.debit_lyd || 0),
      credit_lyd: Number(l.credit_lyd || 0),
      memo: l.memo || null,
    }))
  const { error: le } = await supabase.from('gl_journal_lines').insert(rows)
  if (le) {
    await supabase.from('gl_journal_batches').delete().eq('id', batch.id)
    throw le
  }

  const { data: posted, error: pe } = await supabase.from('gl_journal_batches')
    .update({ status: 'posted' }).eq('id', batch.id).select().single()
  if (pe) throw pe
  return posted
}

export async function voidGlBatch(batchId, reason = '') {
  const { data, error } = await supabase.rpc('void_gl_batch', { p_batch_id: batchId, p_reason: reason || null })
  if (error) throw error
  return data
}

export async function replaceManualJournal({ old_batch_id, journal_date, branch_id = null, memo, lines, reason = '' }) {
  const { data, error } = await supabase.rpc('replace_manual_journal', {
    p_old_batch_id: old_batch_id,
    p_journal_date: journal_date,
    p_branch_id: branch_id,
    p_memo: memo,
    p_lines: lines,
    p_reason: reason || null,
  })
  if (error) throw error
  return data
}

// Posting RPCs
export async function postSalesDay(date, branchId) {
  const { data, error } = await supabase.rpc('gl_post_sales_day', { p_date: date, p_branch: branchId })
  if (error) throw error
  return data
}
export async function syncPeriod({ from, to, branchId = null, force = true }) {
  const { data, error } = await supabase.rpc('gl_sync_period', { p_from: from, p_to: to, p_branch: branchId, p_force: force })
  if (error) throw error
  return data
}
export async function postOpeningBalances(entries, asOf) {
  const { data, error } = await supabase.rpc('gl_post_opening_balances', { p_entries: entries, p_as_of: asOf })
  if (error) throw error
  return data
}

// Reports
export async function trialBalance(asOf, branchId = null) {
  const { data, error } = await supabase.rpc('gl_trial_balance', { p_as_of: asOf, p_branch: branchId })
  if (error) throw error
  return data || []
}
export async function accountLedger(accountId, from, to, branchId = null) {
  const { data, error } = await supabase.rpc('gl_account_ledger', {
    p_account_id: accountId,
    p_from: from,
    p_to: to,
    p_branch: branchId,
  })
  if (error) throw error
  return data || []
}
export async function balanceSheet(asOf, branchId = null) {
  const { data, error } = await supabase.rpc('gl_balance_sheet', { p_as_of: asOf, p_branch: branchId })
  if (error) throw error
  return data || []
}
export async function incomeStatement(from, to, branchId = null) {
  const { data, error } = await supabase.rpc('gl_income_statement', { p_from: from, p_to: to, p_branch: branchId })
  if (error) throw error
  return data || []
}
export async function statementLines(from, to, branchId = null) {
  const { data, error } = await supabase.rpc('gl_statement_lines', { p_from: from, p_to: to, p_branch: branchId })
  if (error) throw error
  return data || []
}
export async function apAging(asOf, branchId = null) {
  const { data, error } = await supabase.rpc('gl_ap_aging', { p_as_of: asOf, p_branch: branchId })
  if (error) throw error
  return data || []
}
export async function supplierStatement(supplierName, asOf, branchId = null) {
  const { data, error } = await supabase.rpc('gl_supplier_statement', {
    p_supplier_name: supplierName,
    p_as_of: asOf,
    p_branch: branchId,
  })
  if (error) throw error
  return data || []
}
export async function cashFlowStatement(from, to, branchId = null) {
  const { data, error } = await supabase.rpc('gl_cash_flow_statement', {
    p_from: from,
    p_to: to,
    p_branch: branchId,
  })
  if (error) throw error
  return data || []
}

// Branches (reuse)
export async function listBranches() {
  const { data, error } = await supabase.from('pos_branches').select('id, name').eq('is_active', true).order('name')
  if (error) return []
  return data || []
}
