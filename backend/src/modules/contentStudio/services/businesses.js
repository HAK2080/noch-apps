import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_businesses'

export async function listBusinesses() {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getBusiness(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createBusiness(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateBusiness(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteBusiness(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
