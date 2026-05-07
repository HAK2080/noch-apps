import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_learning_signals'

export async function listSignals({ businessId, voiceId } = {}) {
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(200)
  if (businessId) q = q.eq('business_id', businessId)
  if (voiceId) q = q.eq('brand_voice_profile_id', voiceId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function recordSignal(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}
