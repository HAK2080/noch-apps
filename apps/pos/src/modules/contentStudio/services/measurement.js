import { supabase } from '../../../lib/supabase'

export async function getContentMeasurementSummary(businessId = null) {
  const { data, error } = await supabase.rpc('content_measurement_summary_v2', {
    p_business_id: businessId,
  })
  if (error) throw error
  return data
}

export async function listPublications(businessId) {
  let query = supabase
    .from('cs_publications')
    .select('*, bank_item:cs_content_bank_items(id,final_text,format,platform), campaign:cs_campaigns(id,name), snapshots:cs_performance_snapshots(*)')
    .order('planned_at', { ascending: false, nullsFirst: false })
  if (businessId) query = query.eq('business_id', businessId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createPublication(input) {
  const { data: auth } = await supabase.auth.getUser()
  const { data: profile } = auth?.user?.id
    ? await supabase
      .from('profiles')
      .select('id')
      .or(`id.eq.${auth.user.id},auth_user_id.eq.${auth.user.id}`)
      .limit(1)
      .maybeSingle()
    : { data: null }
  const { data, error } = await supabase
    .from('cs_publications')
    .insert({ ...input, created_by: profile?.id || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePublication(id, patch) {
  const { data, error } = await supabase
    .from('cs_publications')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function savePerformanceSnapshot(input) {
  const { data: auth } = await supabase.auth.getUser()
  const { data: profile } = auth?.user?.id
    ? await supabase
      .from('profiles')
      .select('id')
      .or(`id.eq.${auth.user.id},auth_user_id.eq.${auth.user.id}`)
      .limit(1)
      .maybeSingle()
    : { data: null }
  const { data, error } = await supabase
    .from('cs_performance_snapshots')
    .upsert(
      { ...input, captured_by: profile?.id || null },
      { onConflict: 'publication_id,horizon' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}
