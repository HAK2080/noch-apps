import { supabase } from './supabase'

// ============================================================
// PROFILES
// ============================================================

export async function getProfiles() {
  const { data, error } = await supabase.rpc('profile_directory_v2', {
    p_active_only: false,
  })
  if (error) throw error
  return data
}

export async function getProfile(id) {
  void id
  const { data, error } = await supabase.rpc('my_profile_v2')
  if (error) throw error
  if (!data?.[0]) throw new Error('Profile not found')
  return data[0]
}

export async function getProfileDirectory({ activeOnly = true, pinOnly = false, branchId = null } = {}) {
  const { data, error } = await supabase.rpc('profile_directory_v2', {
    p_active_only: activeOnly,
    p_pin_only: pinOnly,
    p_branch_id: branchId,
  })
  if (error) throw error
  return data || []
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
  void staffId
  const { error } = await supabase.rpc('request_my_role_change_v2', { p_role: requestedRole })
  if (error) throw error
}

export const approveRoleChange = async (staffId, role) => {
  const { error } = await supabase.rpc('set_profile_role_v2', {
    p_profile_id: staffId,
    p_role: role,
    p_reason: 'Approved role request',
  })
  if (error) throw error
}

export const denyRoleChange = async (staffId) => {
  const { error } = await supabase.rpc('deny_profile_role_request_v2', { p_profile_id: staffId })
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
  const { error } = await supabase.rpc('update_role_permission_v2', {
    p_role: role,
    p_feature: feature,
    p_can_access: canAccess,
    p_can_edit: canEdit,
  })
  if (error) throw error
}

export const getAccountAccessSummary = async () => {
  const { data, error } = await supabase.rpc('access_control_accounts_v2')
  if (error) throw error
  return data || []
}

export const setProfileAccess = async (profileId, enabled, reason) => {
  const { error } = await supabase.rpc('set_profile_access_v2', {
    p_profile_id: profileId,
    p_enabled: enabled,
    p_reason: reason || null,
  })
  if (error) throw error
}
