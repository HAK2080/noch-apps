import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_brand_voice_profiles'

export async function listVoiceProfiles(businessId) {
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: true })
  if (businessId) q = q.eq('business_id', businessId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getVoiceProfile(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createVoiceProfile(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateVoiceProfile(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteVoiceProfile(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
