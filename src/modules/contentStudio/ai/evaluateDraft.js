import { supabase } from '../../../lib/supabase'

export async function evaluateDraft({ draft, voiceProfile }) {
  const { data, error } = await supabase.functions.invoke('cs-evaluate-draft', {
    body: { draft, voiceProfile },
  })
  if (error) throw error
  return data
}
