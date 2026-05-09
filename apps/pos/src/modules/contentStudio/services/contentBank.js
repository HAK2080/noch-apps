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

// Phase 7 — performance update. Whitelisted patch; numeric coercion.
const PERF_TEXT_FIELDS = new Set(['posted_at', 'perf_platform', 'perf_format', 'perf_notes', 'perf_worked_because', 'perf_did_not_work_because'])
const PERF_NUM_FIELDS  = new Set([
  'perf_views', 'perf_likes', 'perf_comments', 'perf_shares', 'perf_saves',
  'perf_profile_visits', 'perf_orders_before', 'perf_orders_after',
  'perf_loyalty_visits_after',
  'hook_rating', 'creative_rating', 'business_impact_rating',
])
const PERF_FIELDS = [...PERF_TEXT_FIELDS, ...PERF_NUM_FIELDS]

export async function updateBankItemPerformance(id, patch) {
  const clean = {}
  for (const k of PERF_FIELDS) {
    if (!(k in patch)) continue
    const v = patch[k]
    if (PERF_NUM_FIELDS.has(k)) {
      clean[k] = v === '' || v == null ? null : Number(v)
    } else {
      clean[k] = v === '' ? null : v
    }
  }
  const { data, error } = await supabase.from(TABLE).update(clean).eq('id', id).select().single()
  if (error) throw error
  return data
}
