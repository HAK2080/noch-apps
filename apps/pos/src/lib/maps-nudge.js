import { supabase } from './supabase'

export async function requestGoogleReview(customerId, branchId) {
  // Mark review as requested
  const { error } = await supabase
    .from('loyalty_customers')
    .update({ review_requested_at: new Date().toISOString() })
    .eq('id', customerId)
  if (error) throw error

  // Get branch google_maps_url and customer phone + full_name
  const { data: branch } = await supabase
    .from('pos_branches')
    .select('name, google_maps_url')
    .eq('id', branchId)
    .single()

  const { data: customer } = await supabase
    .from('loyalty_customers')
    .select('phone, full_name')
    .eq('id', customerId)
    .single()

  return { branch, customer }
}

export async function updateBranchGoogleMapsUrl(branchId, url) {
  const { data, error } = await supabase
    .from('pos_branches')
    .update({ google_maps_url: url })
    .eq('id', branchId)
    .select()
    .single()
  if (error) throw error
  return data
}
