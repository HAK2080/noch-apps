import { supabase } from '../../../lib/supabase'

export async function getInventoryLocations() {
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('*, branch:pos_branches(name, name_ar)')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data || []
}

export async function createInventoryLocation(location) {
  const { data, error } = await supabase
    .from('inventory_locations')
    .insert(location)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getInventoryLocationStock() {
  const { data, error } = await supabase
    .from('inventory_location_stock')
    .select('*, ingredient:ingredients(id, name, name_ar, base_unit), location:inventory_locations(id, name, name_ar, location_type, branch_id)')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function upsertInventoryLocationStock({ ingredientId, locationId, qty, unit, notes }) {
  const payload = {
    ingredient_id: ingredientId,
    location_id: locationId,
    qty_available: Number(qty) || 0,
    unit,
    notes: notes || null,
    last_counted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('inventory_location_stock')
    .upsert(payload, { onConflict: 'ingredient_id,location_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function receiveProcurementOrder({
  orderId,
  receivedQty,
  receivedAt = new Date().toISOString(),
  updateBulkCost = false,
  receiptNotes = null,
  locationId = null,
}) {
  const { data, error } = await supabase.rpc('receive_procurement_order_v2', {
    p_order_id: orderId,
    p_received_qty: Number(receivedQty),
    p_received_at: receivedAt,
    p_update_bulk_cost: !!updateBulkCost,
    p_receipt_notes: receiptNotes || null,
    p_location_id: locationId || null,
  })
  if (error) throw error
  return data
}

export async function returnProcurementOrder({
  orderId,
  returnQty,
  returnedAt = new Date().toISOString(),
  reason = null,
  locationId = null,
}) {
  const { data, error } = await supabase.rpc('return_procurement_order', {
    p_order_id: orderId,
    p_return_qty: Number(returnQty),
    p_returned_at: returnedAt,
    p_reason: reason || null,
    p_location_id: locationId || null,
  })
  if (error) throw error
  return data
}

export async function getInventoryStockValuation() {
  const { data, error } = await supabase
    .from('inventory_stock_valuation')
    .select('*')
    .order('stock_value_lyd', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getInventoryReorderSuggestions() {
  const { data, error } = await supabase
    .from('inventory_reorder_suggestions')
    .select('*')
    .order('suggested_reorder_qty', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getInventorySupplierPriceHistory(ingredientId = null) {
  let query = supabase
    .from('inventory_supplier_price_history')
    .select('*')
    .order('effective_date', { ascending: false })
    .order('procurement_order_id', { ascending: false })
  if (ingredientId) query = query.eq('ingredient_id', ingredientId)
  const { data, error } = await query.limit(20)
  if (error) throw error
  return data || []
}

export async function getProcurementPayablesStatus() {
  const { data, error } = await supabase
    .from('procurement_payables_status')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('invoice_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}
