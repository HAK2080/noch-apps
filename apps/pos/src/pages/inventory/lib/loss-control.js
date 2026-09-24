import { supabase } from '../../../lib/supabase'

export async function listLossControlRows(branchId = null) {
  const { data, error } = await supabase.rpc('inventory_loss_control_report', {
    p_branch_id: branchId || null,
    p_limit: 200,
  })
  if (error) throw error
  return data || []
}

export async function listLossCountItems(branchId) {
  const { data, error } = await supabase.rpc('inventory_loss_count_items', {
    p_branch_id: branchId,
  })
  if (error) throw error
  return data || []
}

export async function recordLossCount({ branchId, itemKind, itemId, countedQty, notes }) {
  const { data, error } = await supabase.rpc('record_inventory_loss_count', {
    p_branch_id: branchId,
    p_item_kind: itemKind,
    p_item_id: itemId,
    p_counted_qty: Number(countedQty),
    p_notes: notes || null,
  })
  if (error) throw error
  return data
}

export async function uploadLossProductStock({ branchId, productId, quantity, unit }) {
  const { data, error } = await supabase.rpc('inventory_loss_upload_product_stock', {
    p_branch_id: branchId,
    p_product_id: productId,
    p_quantity: Number(quantity),
    p_unit: unit,
  })
  if (error) throw error
  return data
}

export async function getLossControlDetail(checkId) {
  const { data, error } = await supabase.rpc('inventory_loss_control_detail', {
    p_check_id: checkId,
  })
  if (error) throw error
  return data || []
}
