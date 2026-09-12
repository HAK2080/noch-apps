import { supabase } from '../../../lib/supabase'

export async function getGlobalStockPolicy() {
  const { data, error } = await supabase.from('pos_global_settings').select('block_unavailable_stock').eq('id', true).single()
  if (error) throw error
  return data.block_unavailable_stock
}

export async function setGlobalStockPolicy(enabled) {
  const { error } = await supabase.rpc('set_global_stock_block', { p_enabled: enabled })
  if (error) throw error
  window.dispatchEvent(new Event('pos-settings-changed'))
}

export async function getSaleAvailability(branchId) {
  const { data, error } = await supabase.rpc('get_sale_availability', { p_branch: branchId })
  if (error) throw error
  return Object.fromEntries((data || []).map(row => [row.product_id, row]))
}

export async function getCustomerSaleAvailability(branchId) {
  const { data, error } = await supabase.rpc('get_customer_sale_availability', { p_branch: branchId || null })
  if (error) throw error
  return new Set((data || []).filter(row => row.available).map(row => row.product_id))
}

export function applySaleAvailability(products, availability) {
  return products.map(product => ({
    ...product,
    sale_blocked: availability[product.id]?.blocked ?? true,
    sale_block_reason: availability[product.id]?.reason || (availability[product.id] ? '' : 'Stock unavailable'),
  }))
}
