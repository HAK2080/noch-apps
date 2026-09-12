import { supabase } from './supabase'

export async function getCustomerAvailableProductIds(branchId = null) {
  const { data, error } = await supabase.rpc('get_customer_sale_availability', { p_branch: branchId })
  if (error) throw error
  return new Set((data || []).filter(row => row.available).map(row => row.product_id))
}
