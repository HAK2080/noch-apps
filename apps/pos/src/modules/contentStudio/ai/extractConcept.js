import { supabase } from '../../../lib/supabase'

async function fetchImageAsBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`)
  const blob = await res.blob()
  const mimeType = blob.type || 'image/jpeg'
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return { base64, mimeType }
}

// Run a single mode against the cs-extract-concept edge function.
// mode is 'mechanism' (default — backward compatible) or 'copy'.
// Returns { concept, mode, duration_ms, ai_model, image_attached }.
export async function extractConcept({ inspiration, voiceProfile, mode = 'mechanism' }) {
  let image = null
  if (inspiration?.preview_image_url) {
    try {
      image = await fetchImageAsBase64(inspiration.preview_image_url)
    } catch (e) {
      console.warn('Could not convert image to base64, will send URL only:', e)
    }
  }

  const { data, error } = await supabase.functions.invoke('cs-extract-concept', {
    body: { inspiration, voiceProfile, image, mode },
  })
  if (error) throw error
  return data
}

// "Do Both" — fire mechanism + copy in parallel and merge their outputs.
// Each prompt fills a disjoint slice of fields, so the merge prefers
// the non-null value from each side. If one side fails, we still return
// the successful side and surface the error.
export async function extractConceptBoth({ inspiration, voiceProfile }) {
  const [mech, copy] = await Promise.allSettled([
    extractConcept({ inspiration, voiceProfile, mode: 'mechanism' }),
    extractConcept({ inspiration, voiceProfile, mode: 'copy' }),
  ])

  if (mech.status === 'rejected' && copy.status === 'rejected') {
    throw mech.reason || copy.reason || new Error('Both extractions failed')
  }

  const mechConcept = mech.status === 'fulfilled' ? mech.value.concept : {}
  const copyConcept = copy.status === 'fulfilled' ? copy.value.concept : {}

  const merged = { ...mechConcept }
  for (const [k, v] of Object.entries(copyConcept)) {
    if (v != null && v !== '' && (merged[k] == null || merged[k] === '')) {
      merged[k] = v
    }
  }

  return {
    concept: merged,
    mode: 'both',
    mechanism_result: mech.status === 'fulfilled' ? mech.value : null,
    copy_result:      copy.status === 'fulfilled' ? copy.value : null,
    mechanism_error:  mech.status === 'rejected'  ? String(mech.reason?.message || mech.reason) : null,
    copy_error:       copy.status === 'rejected'  ? String(copy.reason?.message  || copy.reason) : null,
  }
}

// Best-effort audit log write. Never blocks UI.
export async function logExtraction({ inspirationId, conceptId, mode, output, model, durationMs }) {
  try {
    const { data: { user } = {} } = await supabase.auth.getUser()
    await supabase.from('cs_extraction_log').insert({
      inspiration_id: inspirationId,
      concept_id: conceptId || null,
      mode,
      output,
      model: model || null,
      duration_ms: durationMs ?? null,
      invoked_by: user?.id || null,
    })
  } catch (e) {
    console.warn('cs_extraction_log insert failed:', e)
  }
}
