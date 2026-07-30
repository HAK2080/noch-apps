// pos-supabase.js — POS Supabase library
// All POS CRUD functions. Follows exact pattern from src/lib/supabase.js

import { supabase } from '../../../lib/supabase'
import { ALL_PRODUCTS_SELECT } from './product-query'

// ============================================================
// BRANCHES
// ============================================================

export async function getPOSBranches() {
  const { data, error } = await supabase
    .from('pos_branches')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getPOSBranch(id) {
  const { data, error } = await supabase
    .from('pos_branches')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updatePOSBranch(id, updates) {
  const { data, error } = await supabase
    .from('pos_branches')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// CATEGORIES
// ============================================================

// opts.posOnly  = true  → only categories shown in POS terminal (show_in_pos = true)
// opts.webOnly  = true  → only categories shown on website (show_on_website = true)
// default (no opts)    → all active categories (used by admin pages)
export async function getPOSCategories(branchId, opts = {}) {
  let q = supabase.from('pos_categories').select('*').eq('is_active', true).order('sort_order')
  if (opts.posOnly)  q = q.eq('show_in_pos', true)
  if (opts.webOnly)  q = q.eq('show_on_website', true)
  if (branchId) q = q.or(`visible_branch_ids.cs.{${branchId}},branch_id.eq.${branchId}`)
  const { data, error } = await q
  if (error) throw error
  return data
}

// Centralized category catalog — all categories regardless of branch
export async function getAllCategories() {
  const { data, error } = await supabase
    .from('pos_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data
}

export async function createPOSCategory(data) {
  const { data: result, error } = await supabase
    .from('pos_categories')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return result
}

export async function updatePOSCategory(id, updates) {
  const { data, error } = await supabase
    .from('pos_categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePOSCategory(id) {
  const { error } = await supabase
    .from('pos_categories')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// PRODUCTS
// ============================================================

export async function getPOSProducts(branchId) {
  // Returns products visible at the given branch — array model OR legacy
  // single branch_id column. Mirrors what the storefront Menu.jsx does so
  // both surfaces show the same set.
  let q = supabase
    .from('pos_products')
    .select('*, pos_categories(name, name_ar, color)')
    .eq('is_active', true)
    .eq('visible_on_menu', true)
    .order('menu_sort', { ascending: true, nullsFirst: false })
    .order('name')
  if (branchId) q = q.or(`visible_branch_ids.cs.{${branchId}},branch_id.eq.${branchId}`)
  const { data, error } = await q
  if (error) throw error

  // Popularity sort: best-sellers (last 30 days) float to the top so the
  // cashier finds the most-tapped items first. Ties keep the existing
  // menu_sort/name order (Array.prototype.sort is stable), and unsold
  // products fall to the bottom in that same order. Falls back silently
  // to the unsorted order if the popularity RPC is unavailable (e.g.
  // before the migration is applied) so the grid always loads.
  try {
    const pop = await getProductPopularity(branchId)
    return [...data].sort((a, b) => (pop[b.id] || 0) - (pop[a.id] || 0))
  } catch {
    return data
  }
}

// Units sold per product over the last 30 days (per branch), as a
// { [productId]: count } map. Backed by the get_product_popularity RPC.
export async function getProductPopularity(branchId) {
  const { data, error } = await supabase.rpc('get_product_popularity', {
    p_branch_id: branchId || null,
  })
  if (error) throw error
  const map = {}
  for (const row of data || []) map[row.product_id] = Number(row.units_sold) || 0
  return map
}

// All products across all branches (for catalog page)
export async function getAllProducts() {
  const { data, error } = await supabase
    .from('pos_products')
    .select(ALL_PRODUCTS_SELECT)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

// Sales stats per product for a branch and date range
// Returns { [productId]: { qty, revenue } }
export async function getProductSalesStats(branchId, from, to) {
  const fromDate = from || (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d })()
  const toDate = to || new Date()
  const { data, error } = await supabase
    .from('pos_order_items')
    .select('product_id, quantity, total, pos_orders!inner(branch_id, status, created_at)')
    .eq('pos_orders.branch_id', branchId)
    .eq('pos_orders.status', 'completed')
    .gte('pos_orders.created_at', new Date(fromDate).toISOString())
    .lte('pos_orders.created_at', new Date(toDate).toISOString())
  if (error) return {}
  const stats = {}
  ;(data || []).forEach(row => {
    if (!row.product_id) return
    if (!stats[row.product_id]) stats[row.product_id] = { qty: 0, revenue: 0 }
    stats[row.product_id].qty += parseFloat(row.quantity) || 0
    stats[row.product_id].revenue += parseFloat(row.total) || 0
  })
  return stats
}

export async function uploadProductImage(productId, file) {
  const ext = file.name.split('.').pop()
  const path = `products/${productId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
  if (uploadErr) throw uploadErr
  const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
  await supabase.from('pos_products').update({ image_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', productId)
  return publicUrl
}

export async function getPOSProduct(id) {
  const { data, error } = await supabase
    .from('pos_products')
    .select('*, pos_categories(name, name_ar, color)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createPOSProduct(data) {
  const { data: result, error } = await supabase
    .from('pos_products')
    .insert({ ...data, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return result
}

export async function updatePOSProduct(id, updates) {
  const { data, error } = await supabase
    .from('pos_products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePOSProduct(id) {
  const { error } = await supabase
    .from('pos_products')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// Share another branch's menu with this branch.
// For each product/category visible at sourceBranchId, append targetBranchId
// to its visible_branch_ids array (Postgres set-union via array_append + dedupe).
// Returns { products: n, categories: m } counts of items newly visible at target.
// Idempotent — running twice does nothing because targetBranchId is already in the array.
export async function shareBranchMenu(sourceBranchId, targetBranchId) {
  if (!sourceBranchId || !targetBranchId) throw new Error('Both branches are required')
  if (sourceBranchId === targetBranchId) throw new Error('Source and target must differ')

  // Helper: pull rows visible at source but not yet visible at target.
  const fetchToShare = async (table) => {
    const { data, error } = await supabase
      .from(table)
      .select('id, visible_branch_ids, branch_id')
      .or(`visible_branch_ids.cs.{${sourceBranchId}},branch_id.eq.${sourceBranchId}`)
      .eq('is_active', true)
    if (error) throw error
    return (data || []).filter(row => {
      const arr = Array.isArray(row.visible_branch_ids) ? row.visible_branch_ids : []
      return !arr.includes(targetBranchId)
    })
  }

  const productsToShare = await fetchToShare('pos_products')
  const categoriesToShare = await fetchToShare('pos_categories')

  const updateRow = async (table, row) => {
    const arr = Array.isArray(row.visible_branch_ids) ? row.visible_branch_ids : []
    // Make sure the source branch is also in the array (legacy rows may have only branch_id).
    const next = Array.from(new Set([...arr, sourceBranchId, targetBranchId]))
    const { error } = await supabase
      .from(table)
      .update({ visible_branch_ids: next, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error
  }

  for (const p of productsToShare) await updateRow('pos_products', p)
  for (const c of categoriesToShare) await updateRow('pos_categories', c)

  return { products: productsToShare.length, categories: categoriesToShare.length }
}

export async function getPOSProductByBarcode(branchId, barcode) {
  const { data, error } = await supabase
    .from('pos_products')
    .select('*')
    .eq('branch_id', branchId)
    .eq('barcode', barcode)
    .eq('is_active', true)
    .single()
  if (error) throw error
  return data
}

// ============================================================
// SHIFTS
// ============================================================

export async function getOpenShift(branchId) {
  const { data, error } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

export async function getPOSSecurityStatus(branchId) {
  const { data, error } = await supabase.rpc('pos_security_status', {
    p_branch_id: branchId,
  })
  if (error) {
    if (error.code === '42883' || error.message?.includes('pos_security_status')) return null
    throw error
  }
  return Array.isArray(data) ? (data[0] || null) : (data || null)
}

export async function listPOSAuditEvents(branchId, { limit = 10 } = {}) {
  let rows = []
  const fullSelect = 'id, created_at, action, entity_type, entity_id, metadata, actor_user_id, served_by, approved_by'
  const fallbackSelect = 'id, created_at, action, entity_type, entity_id, metadata, actor_user_id, served_by'

  const runAuditQuery = async (selectClause) => {
    const { data, error } = await supabase
      .from('pos_audit_log')
      .select(selectClause)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  }

  try {
    rows = await runAuditQuery(fullSelect)
  } catch (error) {
    if (!error.message?.includes('approved_by')) throw error
    rows = (await runAuditQuery(fallbackSelect)).map(row => ({ ...row, approved_by: null }))
  }

  const profileIds = [...new Set(rows.flatMap(row => [row.actor_user_id, row.served_by, row.approved_by]).filter(Boolean))]
  if (profileIds.length === 0) {
    return rows.map(row => ({
      ...row,
      actor_name: null,
      served_by_name: null,
      approved_by_name: null,
    }))
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds)
  if (error) {
    return rows.map(row => ({
      ...row,
      actor_name: null,
      served_by_name: null,
      approved_by_name: null,
    }))
  }

  const names = new Map((profiles || []).map(profile => [profile.id, profile.full_name]))
  return rows.map(row => ({
    ...row,
    actor_name: names.get(row.actor_user_id) || null,
    served_by_name: names.get(row.served_by) || null,
    approved_by_name: names.get(row.approved_by) || null,
  }))
}

// List recent shifts for a branch, newest first.
// Default: 30 most recent (about a month). Used by the Sessions page.
// Optional fromIso/toIso filter opened_at (use businessDayWindow for ranges).
export async function listShifts(branchId, { limit = 30, fromIso, toIso } = {}) {
  let q = supabase
    .from('pos_shifts')
    .select('*')
    .eq('branch_id', branchId)
  if (fromIso) q = q.gte('opened_at', fromIso)
  if (toIso) q = q.lte('opened_at', toIso)
  const { data, error } = await q
    .order('opened_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Refunds are deducted from shift revenue but legacy payment buckets remain
// gross. The sessions report applies these to the cash leg so the totals
// reconcile to net revenue.
export async function getShiftRefundTotals(shiftIds = []) {
  if (!shiftIds.length) return {}
  const { data, error } = await supabase.rpc('pos_shift_refund_totals', {
    p_shift_ids: shiftIds,
  })
  if (error) throw error
  return Object.fromEntries((data || []).map(row => [row.shift_id, Number(row.refunded_total) || 0]))
}

export async function openShift(branchId, openingCash, userId) {
  const { data, error } = await supabase
    .from('pos_shifts')
    .insert({
      branch_id: branchId,
      opening_cash: openingCash,
      expected_cash: openingCash,
      status: 'open',
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function closeShift(shiftId, closeData) {
  // Routes through close_pos_shift RPC which:
  //   - locks the shift row (blocks double-close races)
  //   - rejects with 'shift is already closed' if already closed
  //   - reconciles shift totals against pos_orders sum
  //   - writes audit log
  const { data, error } = await supabase.rpc('close_pos_shift', {
    p_shift_id: shiftId,
    p_actual_cash: Number(closeData.closing_cash) || 0,
    p_notes: closeData.notes || null,
  })
  if (error) throw error
  if (closeData.closed_by) {
    try {
      await supabase.rpc('annotate_shift_close_operator', {
        p_shift_id: shiftId,
        p_served_by: closeData.closed_by,
      })
    } catch (auditError) {
      return { ...data, audit_warning: auditError.message || 'Shift close operator was not recorded.' }
    }
  }
  return data
}

// Toggle a product's is_sold_out flag (used by long-press in the terminal).
// Reset happens automatically on shift open via DB trigger or admin action;
// for now the flag is sticky until manually cleared.
export async function setProductSoldOut(productId, soldOut) {
  const { data, error } = await supabase
    .from('pos_products')
    .update({ is_sold_out: !!soldOut, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function recordCashMovement({
  branch_id, shift_id, movement_type, amount, reason, served_by,
}) {
  const { data, error } = await supabase.rpc('record_cash_movement', {
    p_branch_id: branch_id,
    p_shift_id: shift_id || null,
    p_movement_type: movement_type,
    p_amount: Number(amount) || 0,
    p_reason: reason || null,
    p_served_by: served_by || null,
  })
  if (error) throw error
  return data
}

// ── Shift attendees (per-barista clock in/out) ────────────────────
export async function clockInAttendee(shiftId, userId, branchId) {
  const { data, error } = await supabase.rpc('clock_in_attendee', {
    p_shift_id: shiftId, p_user_id: userId, p_branch_id: branchId,
  })
  if (error) throw error
  return data
}
export async function clockOutAttendee(shiftId, userId) {
  const { data, error } = await supabase.rpc('clock_out_attendee', {
    p_shift_id: shiftId, p_user_id: userId,
  })
  if (error) throw error
  return data
}
export async function getShiftAttendees(shiftId) {
  if (!shiftId) return []
  const { data, error } = await supabase
    .from('pos_shift_attendees')
    .select('*, profiles!user_id(id, full_name, photo_url)')
    .eq('shift_id', shiftId)
    .order('clocked_in_at', { ascending: false })
  if (error) throw error
  return data || []
}

// ── Partial refunds ───────────────────────────────────────────────
export async function refundPOSOrderLines(orderId, lines, reason, servedBy = null) {
  const { data, error } = await supabase.rpc('refund_pos_order_lines', {
    p_order_id: orderId,
    p_lines: lines,
    p_reason: reason || null,
    p_served_by: servedBy,
  })
  if (error) throw error
  return data
}

// Swap cash↔card on a completed order. Only supports cash/card; split
// and presto need their own handling. Adjusts shift totals automatically.
export async function switchPOSOrderPayment(orderId, newMethod, servedBy = null) {
  const { data, error } = await supabase.rpc('switch_pos_order_payment', {
    p_order_id: orderId,
    p_new_method: newMethod,
    p_served_by: servedBy,
  })
  if (error) throw error
  return data
}

// ── Reporting ─────────────────────────────────────────────────────
export async function getSalesByProduct(branchId, fromIso, toIso) {
  const { data, error } = await supabase.rpc('pos_sales_by_product', {
    p_branch_id: branchId, p_from: fromIso, p_to: toIso,
  })
  if (error) throw error
  return data || []
}
export async function getProductDemandLines(branchId, fromIso, toIso) {
  const { data, error } = await supabase
    .from('pos_order_items')
    .select('product_id, product_name, quantity, total, pos_orders!inner(branch_id, status, created_at)')
    .eq('pos_orders.branch_id', branchId)
    .eq('pos_orders.status', 'completed')
    .gte('pos_orders.created_at', fromIso)
    .lt('pos_orders.created_at', toIso)
  if (error) throw error
  return data || []
}
export async function getSalesByBarista(branchId, fromIso, toIso) {
  const { data, error } = await supabase.rpc('pos_sales_by_barista', {
    p_branch_id: branchId, p_from: fromIso, p_to: toIso,
  })
  if (error) throw error
  return data || []
}
// fromDate/toDate: plain 'YYYY-MM-DD' LOCAL date strings (the view's `day`
// column is a business day — 5 AM to 5 AM, see helpers above).
export async function getDailySalesRange(branchId, fromDate, toDate) {
  const { data, error } = await supabase
    .from('pos_sales_daily')
    .select('*')
    .eq('branch_id', branchId)
    .gte('day', String(fromDate).slice(0, 10))
    .lte('day', String(toDate).slice(0, 10))
    .order('day', { ascending: true })
  if (error) throw error
  return data || []
}

// ── Modifiers ─────────────────────────────────────────────────────
export async function getModifierGroupsForProduct(productId) {
  // Returns groups + their modifiers, scoped to the product via the
  // pos_product_modifier_groups link table.
  const { data: links } = await supabase
    .from('pos_product_modifier_groups')
    .select('group_id')
    .eq('product_id', productId)
  const groupIds = (links || []).map(l => l.group_id)
  if (!groupIds.length) return []
  const { data: groups, error } = await supabase
    .from('pos_modifier_groups')
    .select('*, pos_modifiers(*)')
    .in('id', groupIds)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (groups || []).map(g => ({
    ...g,
    modifiers: (g.pos_modifiers || []).filter(m => m.is_active).sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export async function getAllModifierData() {
  const [{ data: links }, { data: groups, error }] = await Promise.all([
    supabase.from('pos_product_modifier_groups').select('product_id, group_id'),
    supabase.from('pos_modifier_groups').select('*, pos_modifiers(*)').eq('is_active', true).order('sort_order'),
  ])
  if (error) throw error

  const groupMap = new Map()
  for (const g of groups || []) {
    groupMap.set(g.id, {
      ...g,
      modifiers: (g.pos_modifiers || []).filter(m => m.is_active).sort((a, b) => a.sort_order - b.sort_order),
    })
  }

  const productGroups = new Map()
  for (const link of links || []) {
    if (!productGroups.has(link.product_id)) productGroups.set(link.product_id, [])
    productGroups.get(link.product_id).push(link.group_id)
  }

  return {
    groupsForProduct(productId) {
      const groupIds = productGroups.get(productId) || []
      return groupIds
        .map(id => groupMap.get(id))
        .filter(Boolean)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    },
  }
}

export async function getCashMovements(shiftId) {
  if (!shiftId) return []
  const { data, error } = await supabase
    .from('pos_cash_movements')
    .select('*, profiles!served_by(full_name)')
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function markPrestoCollected(orderId) {
  const { data, error } = await supabase.rpc('mark_presto_collected', {
    p_order_id: orderId,
  })
  if (error) throw error
  return data
}

export async function getShiftSummary(shiftId) {
  const { data: shift, error: shiftErr } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('id', shiftId)
    .single()
  if (shiftErr) throw shiftErr

  const { data: orders, error: ordErr } = await supabase
    .from('pos_orders')
    .select('*, pos_order_items(*)')
    .eq('shift_id', shiftId)
    .eq('status', 'completed')
  if (ordErr) throw ordErr

  // Top products
  const productTotals = {}
  orders?.forEach(o => {
    o.pos_order_items?.forEach(item => {
      if (!productTotals[item.product_name]) {
        productTotals[item.product_name] = { name: item.product_name, qty: 0, total: 0 }
      }
      productTotals[item.product_name].qty += item.quantity
      productTotals[item.product_name].total += parseFloat(item.total)
    })
  })
  const topProducts = Object.values(productTotals)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  return { shift, orders: orders || [], topProducts }
}

// ============================================================
// ORDERS
// ============================================================

// createPOSOrder is now a thin wrapper around the create_pos_order RPC.
// The RPC is atomic, idempotent (via idempotency_key), and uses atomic
// UPDATE for stock + shift totals so concurrent terminals can't lose updates.
//
// orderData should include: branch_id, shift_id, subtotal, discount_amount,
// discount_pct, total, payment_method, cash_tendered, change_due,
// card_amount, loyalty_customer_id, served_by (optional, PIN-verified),
// idempotency_key (UUID — caller should generate at cart-charge time),
// client_created_at (ISO string), offline_order_number (optional, for
// preserving an OFFLINE-N receipt number when syncing).
export async function createPOSOrder(orderData, items) {
  const idempotencyKey =
    orderData.idempotency_key ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

  const itemsPayload = items.map(item => ({
    product_id: item.product_id || null,
    product_name: item.product_name,
    product_name_ar: item.product_name_ar || null,
    unit_price: Number(item.unit_price),
    quantity: parseInt(item.quantity, 10) || 1,
    notes: item.notes || null,
    track_inventory: !!item.track_inventory,
  }))

  const { data, error } = await supabase.rpc('create_pos_order', {
    p_idempotency_key: idempotencyKey,
    p_branch_id: orderData.branch_id,
    p_shift_id: orderData.shift_id || null,
    p_served_by: orderData.served_by || null,
    p_subtotal: Number(orderData.subtotal) || 0,
    p_discount_amount: Number(orderData.discount_amount) || 0,
    p_discount_pct: Number(orderData.discount_pct) || 0,
    p_total: Number(orderData.total) || 0,
    p_payment_method: orderData.payment_method || 'cash',
    p_cash_tendered: orderData.cash_tendered != null ? Number(orderData.cash_tendered) : null,
    p_change_due: Number(orderData.change_due) || 0,
    p_card_amount: Number(orderData.card_amount) || 0,
    p_loyalty_customer_id: orderData.loyalty_customer_id || null,
    p_client_created_at: orderData.client_created_at || new Date().toISOString(),
    p_offline_order_number: orderData.offline_order_number || null,
    p_items: itemsPayload,
    p_customer_name: orderData.customer_name || null,
    p_customer_phone: orderData.customer_phone || null,
  })
  if (error) throw error

  if (orderData.override_by && data?.order?.id) {
    try {
      await supabase.rpc('annotate_pos_sale_override', {
        p_order_id: data.order.id,
        p_manager_override_by: orderData.override_by,
        p_note: orderData.override_note || 'Discount approved above staff cap.',
      })
      data.order.manager_override_by = orderData.override_by
    } catch (auditError) {
      data.audit_warning = auditError.message || 'Manager override audit was not recorded.'
    }
  }

  // RPC returns { order, items, idempotent_replay }. Flatten for callers
  // that expected the old shape (order with pos_order_items inline).
  const order = data?.order || {}
  const returnedItems = data?.items || []
  return {
    ...order,
    pos_order_items: returnedItems,
    idempotent_replay: !!data?.idempotent_replay,
    audit_warning: data?.audit_warning || null,
  }
}

export async function annotatePOSOrderOverride({
  orderId, action, managerId, note = null, servedBy = null,
}) {
  const { data, error } = await supabase.rpc('annotate_pos_order_override', {
    p_order_id: orderId,
    p_override_action: action,
    p_manager_override_by: managerId,
    p_note: note,
    p_served_by: servedBy,
  })
  if (error) throw error
  return data
}

export async function getPOSOrders(branchId, filters = {}) {
  let query = supabase
    .from('pos_orders')
    .select('*, pos_order_items(*)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })

  if (filters.shiftId) query = query.eq('shift_id', filters.shiftId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getSalesExportRows(branchId, filters = {}) {
  const pageSize = filters.pageSize || 1000
  const rows = []
  let from = 0
  let total = null

  while (true) {
    let query = supabase
      .from('pos_order_items')
      .select(`
        id,
        product_id,
        product_name,
        product_name_ar,
        quantity,
        unit_price,
        total,
        refunded_qty,
        notes,
        pos_orders!inner(
          id,
          order_number,
          branch_id,
          shift_id,
          status,
          source,
          payment_method,
          subtotal,
          discount_amount,
          discount_pct,
          total,
          cash_tendered,
          change_due,
          card_amount,
          customer_name,
          customer_phone,
          table_number,
          pickup_code,
          created_at,
          served_by,
          served_by_profile:profiles!pos_orders_served_by_fkey(full_name),
          pos_branches(name, name_ar)
        )
      `, { count: 'exact' })
      .eq('pos_orders.branch_id', branchId)
      .order('created_at', { foreignTable: 'pos_orders', ascending: false })
      .range(from, from + pageSize - 1)

    if (filters.from) query = query.gte('pos_orders.created_at', filters.from)
    if (filters.to) query = query.lte('pos_orders.created_at', filters.to)
    if (filters.status) query = query.eq('pos_orders.status', filters.status)

    const { data, error, count } = await query
    if (error) throw error

    if (total === null && typeof count === 'number') total = count
    rows.push(...(data || []))
    if (!data || data.length === 0) break
    if (total !== null && rows.length >= total) break
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

export async function voidPOSOrder(orderId, reason, servedBy = null) {
  // Routes through void_pos_order RPC which atomically reverses stock,
  // shift totals, and writes the audit log.
  const { data, error } = await supabase.rpc('void_pos_order', {
    p_order_id: orderId,
    p_reason: reason || null,
    p_served_by: servedBy,
  })
  if (error) throw error
  return data
}

export async function getOrderById(id) {
  const { data, error } = await supabase
    .from('pos_orders')
    .select('*, pos_order_items(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ============================================================
// REPORTS
// ============================================================

export async function getDailySales(branchId, date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('pos_orders')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'completed')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
  if (error) throw error

  const orders = data || []
  const total = orders.reduce((s, o) => s + parseFloat(o.total), 0)
  const cash = orders.filter(o => o.payment_method === 'cash' || o.payment_method === 'split')
    .reduce((s, o) => s + parseFloat(o.total) - parseFloat(o.card_amount || 0), 0)
  const card = orders.filter(o => o.payment_method === 'card')
    .reduce((s, o) => s + parseFloat(o.total), 0)
    + orders.filter(o => o.payment_method === 'split')
      .reduce((s, o) => s + parseFloat(o.card_amount || 0), 0)

  return { orders, total, cash, card, count: orders.length }
}

export async function getShiftReport(shiftId) {
  return getShiftSummary(shiftId)
}
