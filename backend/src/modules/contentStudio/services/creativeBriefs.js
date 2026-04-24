import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_creative_briefs'

export async function listBriefs(bankItemId) {
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (bankItemId) q = q.eq('content_bank_item_id', bankItemId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createBrief(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateBrief(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
