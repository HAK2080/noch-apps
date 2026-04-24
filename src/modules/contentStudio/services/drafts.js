import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_draft_variants'

export async function listDrafts({ conceptId, businessId, status } = {}) {
  let q = supabase
    .from(TABLE)
    .select('*, voice:cs_brand_voice_profiles(id, name, business_id)')
    .order('created_at', { ascending: false })
  if (conceptId) q = q.eq('concept_id', conceptId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  const rows = data || []
  return businessId ? rows.filter(r => r.voice?.business_id === businessId) : rows
}

export async function getDraft(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createDraft(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

/** Updates only metadata fields (status). Body changes should create a new row via createDraft + parent_draft_id. */
export async function updateDraftStatus(id, status) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
