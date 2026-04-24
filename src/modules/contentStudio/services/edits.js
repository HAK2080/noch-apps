import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_user_edits'

export async function listEditsForDraft(draftId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function recordEdit(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}
