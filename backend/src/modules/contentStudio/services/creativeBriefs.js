import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_creative_briefs'

export async function listBriefs(bankItemId) {
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (bankItemId) q = q.eq('content_bank_item_id', bankItemId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function listBriefsByBusiness(businessId, { status } = {}) {
  let q = supabase.from(TABLE).select('*').eq('business_id', businessId).order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getBrief(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createBrief(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateBrief(id, patch) {
  const { data, error } = await supabase.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteBrief(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
