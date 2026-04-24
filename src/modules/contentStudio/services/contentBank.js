import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_content_bank_items'

export async function listBankItems(filters = {}) {
  let q = supabase
    .from(TABLE)
    .select('*, voice:cs_brand_voice_profiles(id, name), business:cs_businesses(id, name)')
    .order('approved_at', { ascending: false })
  if (filters.businessId) q = q.eq('business_id', filters.businessId)
  if (filters.voiceId)    q = q.eq('brand_voice_profile_id', filters.voiceId)
  if (filters.platform)   q = q.eq('platform', filters.platform)
  if (filters.format)     q = q.eq('format', filters.format)
  if (filters.pillar)     q = q.eq('content_pillar', filters.pillar)
  if (filters.status)     q = q.eq('status', filters.status)
  if (filters.search)     q = q.ilike('final_text', `%${filters.search}%`)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getBankItem(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function approveDraftToBank(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function archiveBankItem(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'archived' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
