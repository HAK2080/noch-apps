import { supabase } from '../../../lib/supabase'

export async function humanizeDraft({ draft, action, voiceProfile }) {
  const { data, error } = await supabase.functions.invoke('cs-humanize-draft', {
    body: { draft, action, voiceProfile },
  })
  if (error) throw error
  return data
}
