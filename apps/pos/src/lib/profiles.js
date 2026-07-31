import { supabase } from './supabase'

// ============================================================
// PROFILES
// ============================================================

export async function getProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data
}

export async function getProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getStaffProfiles() {
  const { data, error } = await supabase.rpc('workforce_team_v2')
  if (error) throw error
  return (data || []).filter(profile => profile.is_active !== false)
}

export async function getAllTeamMembers() {
  const { data, error } = await supabase.rpc('workforce_team_v2')
  if (error) throw error
  return data || []
}

export async function createStaffProfile(nameOrPayload, telegramChatId) {
  const id = crypto.randomUUID()
  const payload = typeof nameOrPayload === 'string'
    ? { full_name: nameOrPayload, telegram_chat_id: telegramChatId || null }
    : { ...nameOrPayload }
  const row = { id, role: 'staff', is_employee: true, ...payload }
  const { error } = await supabase.from('profiles').insert(row)
  if (error) throw error
  return row
}

export async function updateProfile(id, updates) {
  // Filter out pin_code from direct updates; it must be set via RPC
  const safeUpdates = { ...updates }
  delete safeUpdates.pin_code

  const { data, error } = await supabase
    .from('profiles')
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Save blocked — check permissions (RLS). Contact admin.')
}

// Owner-only: set another user's PIN
export async function setPIN(userId, newPIN) {
  const { data, error } = await supabase.rpc('set_pos_pin', {
    p_user_id: userId,
    p_new_pin: newPIN,
  })
  if (error) throw error
  return data
}

// Self-service: any staff member can update their own PIN
export async function setMyPIN(newPIN) {
  const { data, error } = await supabase.rpc('set_my_pin', {
    p_new_pin: newPIN,
  })
  if (error) throw error
  return data
}

export async function deleteProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Delete blocked — check permissions (RLS). Owner role required.')
  }
}

// ============================================================
// STAFF — profile management helpers
// ============================================================

export const updateStaffProfile = async (id, data) => {
  const { error } = await supabase.from('profiles').update(data).eq('id', id)
  if (error) throw error
}

export const requestRoleChange = async (staffId, requestedRole) => {
  const { error } = await supabase.from('profiles').update({ role_requested: requestedRole, role_approved: false }).eq('id', staffId)
  if (error) throw error
}

export const approveRoleChange = async (staffId, role) => {
  const { error } = await supabase.from('profiles').update({ role, role_requested: null, role_approved: true }).eq('id', staffId)
  if (error) throw error
}

export const denyRoleChange = async (staffId) => {
  const { error } = await supabase.from('profiles').update({ role_requested: null, role_approved: false }).eq('id', staffId)
  if (error) throw error
}

// ============================================================
// ROLE PERMISSIONS — RBAC
// ============================================================

export const getRolePermissions = async () => {
  const { data, error } = await supabase.from('role_permissions').select('*').order('role')
  if (error) throw error
  return data
}

export const updateRolePermission = async (role, feature, canAccess, canEdit) => {
  const { error } = await supabase.from('role_permissions').upsert({ role, feature, can_access: canAccess, can_edit: canEdit, updated_at: new Date().toISOString() }, { onConflict: 'role,feature' })
  if (error) throw error
}
