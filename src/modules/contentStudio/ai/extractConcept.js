import { supabase } from '../../../lib/supabase'

/**
 * Calls cs-extract-concept edge function. Phase 2 will implement the function.
 * For Phase 1 this is a stub that throws so callers can be wired now.
 */
export async function extractConcept({ inspiration, voiceProfile }) {
  const { data, error } = await supabase.functions.invoke('cs-extract-concept', {
    body: { inspiration, voiceProfile },
  })
  if (error) throw error
  return data
}
