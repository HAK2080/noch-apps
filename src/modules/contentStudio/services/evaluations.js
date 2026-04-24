import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_draft_evaluations'

export async function listEvaluationsForDraft(draftId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function latestEvaluation(draftId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createEvaluation(input) {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single()
  if (error) throw error
  return data
}
