// pos-inventory-supabase.js — POS inventory/stock Supabase helpers
// Extracted from pos-supabase.js (INVENTORY section). Follows exact pattern from src/lib/supabase.js

import { supabase } from '../../../lib/supabase'

export async function updateProductStock(productId, newQty) {
  const { data, error } = await supabase
    .from('pos_products')
    .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getProductCostComponents(productId) {
  if (!productId) return []
  const { data, error } = await supabase
    .from('pos_product_cost_components')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order')
  if (error) throw error
  return data || []
}

export async function replaceProductCostComponents(productId, components) {
  const { data, error } = await supabase.rpc('replace_pos_product_cost_components', {
    p_product_id: productId,
    p_components: components,
  })
  if (error) throw error
  return data
}

export async function receiveProductStock(productId, quantity, unit, actorProfileId = null) {
  const sourceRef = typeof crypto !== 'undefined' && crypto.randomUUID
    ? `pos:${crypto.randomUUID()}`
    : `pos:${Date.now()}-${Math.random().toString(16).slice(2)}`

  const { data, error } = await supabase.rpc('receive_pos_product_stock', {
    p_product_id: productId,
    p_quantity: Number(quantity),
    p_source: 'pos',
    p_source_ref: sourceRef,
    p_actor_profile_id: actorProfileId,
    p_unit: unit,
  })
  if (error) throw error
  return data
}

export async function createInventoryMovement(data) {
  const { data: result, error } = await supabase
    .from('pos_inventory_movements')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return result
}

export async function getLowStockProducts(branchId) {
  const { data, error } = await supabase
    .from('pos_products')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .eq('track_inventory', true)
  if (error) throw error
  return (data || []).filter(p => parseFloat(p.stock_qty) <= parseFloat(p.low_stock_alert))
}
