import { supabase } from '../../../lib/supabase'

export async function generateDrafts({ concept, voiceProfile, platform, format, n = 3 }) {
  const { data, error } = await supabase.functions.invoke('cs-generate-drafts', {
    body: { concept, voiceProfile, platform, format, n },
  })
  if (error) throw error
  return data
}
