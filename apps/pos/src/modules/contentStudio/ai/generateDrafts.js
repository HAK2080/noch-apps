import { supabase } from '../../../lib/supabase'

// Original signature: generate from a concept.
export async function generateDrafts({ concept, voiceProfile, platform, format, n = 3 }) {
  const { data, error } = await supabase.functions.invoke('cs-generate-drafts', {
    body: { concept, voiceProfile, platform, format, n },
  })
  if (error) throw error
  return data
}

// Phase 2 — generate drafts from a Brief. We synthesise a concept-shaped
// payload so the existing edge function works unchanged. Brief fields
// override the synthesised concept fields where overlapping.
export async function generateDraftsFromBrief({ brief, voiceProfile, n = 3 }) {
  const synthConcept = {
    // Use the linked concept as the base if present, then layer brief on top.
    ...(brief.concept || {}),
    hook_summary:           brief.customer_signal || brief.concept?.hook_summary || null,
    content_pattern:        brief.nochi_format    || brief.concept?.content_pattern || null,
    emotional_driver:       brief.emotional_angle || brief.concept?.emotional_driver || null,
    emotional_trigger:      brief.emotional_angle || brief.concept?.emotional_trigger || null,
    target_audience:        brief.target_audience || brief.concept?.target_audience || null,
    why_it_works:           brief.objective       || brief.concept?.why_it_works || null,
    reusable_mechanism:     brief.content_mission || brief.concept?.reusable_mechanism || null,
    suggested_content_mission: brief.content_mission || brief.concept?.suggested_content_mission || null,
    suggested_nochi_format:    brief.nochi_format    || brief.concept?.suggested_nochi_format || null,
    notes:                  [
      brief.notes,
      brief.product_focus ? `Product focus: ${brief.product_focus}` : '',
      brief.cta_style ? `CTA style: ${brief.cta_style}` : '',
      brief.dialect ? `Dialect: ${brief.dialect}` : '',
    ].filter(Boolean).join('\n') || brief.concept?.notes || null,
    // Pass-through identity fields so the generator can credit/label.
    source_brand: brief.concept?.source_brand || null,
    voice_type:   brief.concept?.voice_type   || null,
    post_nature:  brief.concept?.post_nature  || null,
    // Preserve the upstream linkage in the response so the caller can
    // attach it to the new draft rows.
    __brief_id:   brief.id,
    __concept_id: brief.reference_concept_id || brief.concept?.id || null,
  }

  const platform = brief.platform || 'instagram'
  const format   = brief.format   || 'reel'

  const { data, error } = await supabase.functions.invoke('cs-generate-drafts', {
    body: { concept: synthConcept, voiceProfile, platform, format, n },
  })
  if (error) throw error
  return { ...data, brief_id: brief.id, concept_id: synthConcept.__concept_id || null }
}
