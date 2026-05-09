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

// Merge extracted dialect training data into a voice profile.
// Deduplicates by dialect form (lexicon) and by text (gold examples).
export async function mergeDialectTraining(profileId, item) {
  const profile = await getVoiceProfile(profileId)

  const existDialect = new Set((profile.dialect_lexicon || []).map(e => e.dialect?.trim()).filter(Boolean))
  const existGold    = new Set((profile.gold_examples   || []).map(e => e.text?.trim()).filter(Boolean))
  const existForbid  = new Set(profile.forbidden_msa_forms || [])

  const newLexicon  = (item.extracted_lexicon   || []).filter(e => e.dialect && !existDialect.has(e.dialect.trim()))
  const newGold     = (item.extracted_gold      || []).filter(e => e.text    && !existGold.has(e.text.trim()))
  const newForbid   = (item.extracted_forbidden || []).filter(w => w         && !existForbid.has(w))

  return updateVoiceProfile(profileId, {
    dialect_lexicon:     [...(profile.dialect_lexicon      || []), ...newLexicon],
    gold_examples:       [...(profile.gold_examples        || []), ...newGold],
    forbidden_msa_forms: [...(profile.forbidden_msa_forms  || []), ...newForbid],
    dialect_last_tuned_at: new Date().toISOString(),
  })
}
