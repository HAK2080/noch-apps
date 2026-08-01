// pos-audit-supabase.js — Security status + audit log domain
// Extracted from pos-supabase.js (Audit section). Follows exact pattern from src/lib/supabase.js

import { supabase } from '../../../lib/supabase'

export async function getPOSSecurityStatus(branchId) {
  const { data, error } = await supabase.rpc('pos_security_status', {
    p_branch_id: branchId,
  })
  if (error) {
    if (error.code === '42883' || error.message?.includes('pos_security_status')) return null
    throw error
  }
  return Array.isArray(data) ? (data[0] || null) : (data || null)
}

export async function listPOSAuditEvents(branchId, { limit = 10 } = {}) {
  let rows = []
  const fullSelect = 'id, created_at, action, entity_type, entity_id, metadata, actor_user_id, served_by, approved_by'
  const fallbackSelect = 'id, created_at, action, entity_type, entity_id, metadata, actor_user_id, served_by'

  const runAuditQuery = async (selectClause) => {
    const { data, error } = await supabase
      .from('pos_audit_log')
      .select(selectClause)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  }

  try {
    rows = await runAuditQuery(fullSelect)
  } catch (error) {
    if (!error.message?.includes('approved_by')) throw error
    rows = (await runAuditQuery(fallbackSelect)).map(row => ({ ...row, approved_by: null }))
  }

  const profileIds = [...new Set(rows.flatMap(row => [row.actor_user_id, row.served_by, row.approved_by]).filter(Boolean))]
  if (profileIds.length === 0) {
    return rows.map(row => ({
      ...row,
      actor_name: null,
      served_by_name: null,
      approved_by_name: null,
    }))
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds)
  if (error) {
    return rows.map(row => ({
      ...row,
      actor_name: null,
      served_by_name: null,
      approved_by_name: null,
    }))
  }

  const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name]))
  return rows.map(row => ({
    ...row,
    actor_name: names.get(row.actor_user_id) || null,
    served_by_name: names.get(row.served_by) || null,
    approved_by_name: names.get(row.approved_by) || null,
  }))
}
