// warehouse.js — Central warehouse + branch transfer data helpers
// Contract: supabase/migrations/20260719180000_central_warehouse_transfers.sql
// All transfer/warehouse-stock writes go through the security-definer RPCs
// (RLS: read authenticated, no direct write grants on inventory_transfers
// or location_product_stock).

import { supabase } from '../../../lib/supabase'

export const WASTE_REASONS = ['used', 'damaged', 'lost', 'thrown_away', 'expired', 'staff_meal', 'count_correction']

// ── Locations ────────────────────────────────────────────────
export async function listProducts() {
  const { data, error } = await supabase
    .from('pos_products')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}

export async function listLocations() {
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('*')
    .order('name')
  if (error) throw error
  return data || []
}

export async function getWarehouseLocation() {
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('*')
    .eq('location_type', 'warehouse')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── Warehouse stock ──────────────────────────────────────────
export async function listWarehouseStock() {
  const warehouse = await getWarehouseLocation()
  if (!warehouse) return { warehouse: null, rows: [] }
  const { data, error } = await supabase
    .from('location_product_stock')
    .select('id, product_id, qty, updated_at, pos_products(name)')
    .eq('location_id', warehouse.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  const rows = (data || []).map(r => ({
    ...r,
    product_name: r.pos_products?.name || 'Unknown product',
  }))
  return { warehouse, rows }
}

// ── Transfers ────────────────────────────────────────────────
export async function listTransfers({ status, limit = 50 } = {}) {
  let q = supabase
    .from('inventory_transfers')
    .select('*, pos_products(name)')
    .order('requested_at', { ascending: false })
    .limit(limit)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(t => ({
    ...t,
    product_name: t.pos_products?.name || 'Unknown product',
  }))
}

export async function requestTransfer(productId, toLocationId, qty, note) {
  const { data, error } = await supabase.rpc('request_transfer', {
    p_product_id: productId,
    p_to_location_id: toLocationId,
    p_qty: qty,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function shipTransfer(transferId, qty) {
  const { data, error } = await supabase.rpc('ship_transfer', {
    p_transfer_id: transferId,
    p_qty: qty,
  })
  if (error) throw error
  return data
}

export async function receiveTransfer(transferId, qtyReceived, discrepancyReason) {
  const { data, error } = await supabase.rpc('receive_transfer', {
    p_transfer_id: transferId,
    p_qty_received: qtyReceived,
    p_discrepancy_reason: discrepancyReason || null,
  })
  if (error) throw error
  return data
}

// Cancel a still-requested transfer (owner/supervisor; status -> cancelled).
export async function cancelTransfer(transferId) {
  const { error } = await supabase.rpc('cancel_transfer', { p_transfer_id: transferId })
  if (error) throw error
}

// Receive stock into the central warehouse (owner/supervisor).
export async function receiveWarehouseStock(productId, qty, note) {
  const { error } = await supabase.rpc('receive_warehouse_stock', {
    p_product_id: productId,
    p_qty: qty,
    p_note: note || null,
  })
  if (error) throw error
}

// ── Waste ────────────────────────────────────────────────────
export async function reportWaste(branchId, productId, qty, reason, note) {
  const { data, error } = await supabase.rpc('report_waste', {
    p_branch_id: branchId,
    p_product_id: productId,
    p_qty: qty,
    p_reason: reason,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

// ── In transit ───────────────────────────────────────────────
export async function listInTransit() {
  const { data, error } = await supabase
    .from('inventory_in_transit')
    .select('*')
  if (error) throw error
  return data || []
}

// ── Branch par levels ────────────────────────────────────────
export async function listBranchPar(branchId) {
  const { data, error } = await supabase
    .from('pos_product_branch_par')
    .select('*')
    .eq('branch_id', branchId)
  if (error) throw error
  return data || []
}

export async function upsertBranchPar(branchId, productId, minQty, targetQty) {
  const { data, error } = await supabase
    .from('pos_product_branch_par')
    .upsert({
      branch_id: branchId,
      product_id: productId,
      min_qty: minQty,
      target_qty: targetQty,
    }, { onConflict: 'branch_id,product_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Movement history ─────────────────────────────────────────
export async function listMovementHistory({ branchId, movementType, dateFrom, dateTo, limit = 200 } = {}) {
  let q = supabase
    .from('pos_inventory_movements')
    .select('*, pos_products(name), pos_branches(name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (branchId) q = q.eq('branch_id', branchId)
  if (movementType) q = q.eq('movement_type', movementType)
  if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
  if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59`)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(m => ({
    ...m,
    product_name: m.pos_products?.name || 'Unknown product',
    branch_name: m.pos_branches?.name || '—',
  }))
}
