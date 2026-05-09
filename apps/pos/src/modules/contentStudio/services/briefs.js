// briefs.js — Phase 2 strategic-brief service.
// Sits between concept/inspiration/signal/idea and draft generation.

import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_briefs'

export const BRIEF_STATUSES = ['draft', 'ready', 'used', 'archived']

const SELECT_COLS = `
  *,
  inspiration:cs_inspirations!reference_inspiration_id(id, title, preview_image_url, platform),
  concept:cs_extracted_concepts!reference_concept_id(id, hook_summary, copy_risk_level),
  campaign:cs_campaigns!campaign_id(id, name, status)
`

export async function listBriefs({ businessId, status, campaignId } = {}) {
  let q = supabase.from(TABLE).select(SELECT_COLS).order('created_at', { ascending: false })
  if (businessId) q = q.eq('business_id', businessId)
  if (status)     q = q.eq('status', status)
  if (campaignId) q = q.eq('campaign_id', campaignId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getBrief(id) {
  const { data, error } = await supabase.from(TABLE).select(SELECT_COLS).eq('id', id).single()
  if (error) throw error
  return data
}

export async function createBrief(input) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const payload = { ...input, created_by: user?.id }
  const { data, error } = await supabase.from(TABLE).insert(payload).select(SELECT_COLS).single()
  if (error) throw error
  return data
}

export async function updateBrief(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select(SELECT_COLS).single()
  if (error) throw error
  return data
}

export async function deleteBrief(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

// Convenience constructors — each one preselects defaults so the form
// opens with the right fields already filled.

export function blankBrief(overrides = {}) {
  return {
    title: '',
    objective: '',
    content_mission: '',
    target_audience: '',
    product_focus: '',
    customer_signal: '',
    emotional_angle: '',
    content_pillar: '',
    nochi_format: '',
    platform: 'instagram',
    format: 'reel',
    language: 'ar',
    dialect: 'libyan',
    cta_style: '',
    source_signal_type: 'manual',
    notes: '',
    status: 'draft',
    ...overrides,
  }
}

export function fromConcept(concept, inspiration) {
  return blankBrief({
    title: inspiration?.title ? `Brief: ${inspiration.title}` : 'Brief from concept',
    objective: concept?.suggested_content_mission || '',
    content_mission: concept?.suggested_content_mission || concept?.mechanism_summary || '',
    target_audience: concept?.target_audience || '',
    emotional_angle: concept?.emotional_trigger || concept?.emotional_driver || '',
    nochi_format: concept?.suggested_nochi_format || '',
    customer_signal: concept?.hook_summary || '',
    copy_risk_level: concept?.copy_risk_level || null,
    risk_level: concept?.originality_risk || null,
    reference_concept_id: concept?.id || null,
    reference_inspiration_id: inspiration?.id || concept?.inspiration_id || null,
    source_signal_type: concept ? 'concept' : 'inspiration',
    notes: concept?.noch_adaptation || '',
  })
}

export function fromInspiration(inspiration) {
  return blankBrief({
    title: inspiration?.title ? `Brief: ${inspiration.title}` : 'Brief from inspiration',
    reference_inspiration_id: inspiration?.id || null,
    source_signal_type: 'inspiration',
    customer_signal: inspiration?.title || '',
    notes: inspiration?.source_text?.slice(0, 800) || '',
  })
}

export function fromSignal(signal) {
  return blankBrief({
    title: signal?.title || 'Brief from signal',
    objective: signal?.suggested_mission || '',
    content_mission: signal?.suggested_mission || '',
    target_audience: signal?.suggested_audience || '',
    product_focus: signal?.suggested_product || '',
    nochi_format: signal?.suggested_nochi_format || '',
    customer_signal: signal?.explanation || signal?.title || '',
    source_signal_type: signal?.signal_source === 'pos' ? 'pos_signal' : 'loyalty_signal',
    notes: signal?.explanation
      ? `Signal: ${signal.title}\n\n${signal.explanation}`
      : signal?.title || '',
  })
}

export function fromIdea(idea) {
  // Map Ideas categories → suggested Nochi formats. Examples from spec.
  const cat = String(idea?.category || '').toLowerCase()
  const formatHint =
    cat.includes('customer') && (cat.includes('phrase') || cat.includes('quote')) ? 'Nochi Confession / Counter Talk' :
    cat.includes('staff') ? 'Staff POV / Behind the Bar' :
    cat.includes('product') || cat.includes('question') ? 'Educate / Explain' :
    cat.includes('behavior') || cat.includes('mood') ? 'Tripoli Mood / Drink Drama' :
    ''
  return blankBrief({
    title: idea?.title ? `Brief: ${idea.title}` : 'Brief from idea',
    objective: idea?.title || '',
    notes: [idea?.title, idea?.notes].filter(Boolean).join('\n\n'),
    content_pillar: idea?.category || '',
    nochi_format: formatHint,
    source_signal_type: 'local_idea',
  })
}

// Compute a deterministic 1-5 score from the six sub-scores when present.
export function computeBriefQuality(b) {
  const ks = [
    b?.q_objective_clarity, b?.q_audience_clarity, b?.q_nochi_fit,
    b?.q_local_relevance, b?.q_business_value, b?.q_execution_simplicity,
  ].filter(n => Number.isFinite(n))
  if (ks.length === 0) return null
  const avg = ks.reduce((s, n) => s + n, 0) / ks.length
  return Math.max(1, Math.min(5, Math.round(avg)))
}
