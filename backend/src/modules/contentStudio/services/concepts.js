import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_extracted_concepts'

export async function listConcepts({ businessId } = {}) {
  let q = supabase
    .from(TABLE)
    .select('*, inspiration:cs_inspirations!inspiration_id(id, title, business_id, source_type, source_url, preview_image_url)')
    .order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) throw error
  const rows = data || []
  return businessId ? rows.filter(r => r.inspiration?.business_id === businessId) : rows
}

export async function getConcept(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, inspiration:cs_inspirations!inspiration_id(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getConceptByInspirationId(inspirationId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('inspiration_id', inspirationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createConcept(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateConcept(id, patch) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, edited_by_user: true })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
