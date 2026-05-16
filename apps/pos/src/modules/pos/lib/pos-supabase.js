// pos-supabase.js — POS Supabase library
// All POS CRUD functions. Follows exact pattern from src/lib/supabase.js

import { supabase } from '../../../lib/supabase'

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
    .order('name')
  if (branchId) q = q.or(`visible_branch_ids.cs.{${branchId}},branch_id.eq.${branchId}`)
  const { data, error } = await q
  if (error) throw error
  return data
}

// All products across all branches (for catalog page)
export async function getAllProducts() {
  const { data, error } = await supabase
    .from('pos_products')
    .select('*, pos_categories(name, name_ar, color), pos_branches(name)')
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

// List recent shifts for a branch, newest first.
// Default: 30 most recent (about a month). Used by the Sessions page.
export async function listShifts(branchId, { limit = 30 } = {}) {
  const { data, error } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('branch_id', branchId)
    .order('opened_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
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
export async function getSalesByBarista(branchId, fromIso, toIso) {
  const { data, error } = await supabase.rpc('pos_sales_by_barista', {
    p_branch_id: branchId, p_from: fromIso, p_to: toIso,
  })
  if (error) throw error
  return data || []
}
export async function getDailySalesRange(branchId, fromIso, toIso) {
  const { data, error } = await supabase
    .from('pos_sales_daily')
    .select('*')
    .eq('branch_id', branchId)
    .gte('day', fromIso.slice(0, 10))
    .lte('day', toIso.slice(0, 10))
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

// Generate branch code from name
function getBranchCode(branchName) {
  return branchName
    .split(' ')
    .filter(w => /[A-Za-z]/.test(w))
    .map(w => w[0].toUpperCase())
    .join('')
    .slice(0, 3) || 'POS'
}

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

  // RPC returns { order, items, idempotent_replay }. Flatten for callers
  // that expected the old shape (order with pos_order_items inline).
  const order = data?.order || {}
  const returnedItems = data?.items || []
  return { ...order, pos_order_items: returnedItems, idempotent_replay: !!data?.idempotent_replay }
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
// INVENTORY
// ============================================================

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

// ============================================================
// STOCK CHECK (weekly simple check-in tool)
// ============================================================

const PRIORITY_ORDER = { critical: 0, important: 1, low: 2 }

export async function getStockCheckItems(branchId) {
  const { data, error } = await supabase
    .from('stock_check_items')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data || []).sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) ||
    a.sort_order - b.sort_order
  )
}

export async function getLatestStockEntries(branchId) {
  // Fetch all entries for this branch, then keep only the latest per item
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('*')
    .eq('branch_id', branchId)
    .order('checked_at', { ascending: false })
  if (error) throw error
  const map = {}
  for (const entry of data || []) {
    if (!map[entry.item_id]) map[entry.item_id] = entry
  }
  return map  // { item_id: entry }
}

export async function hasCheckThisWeek(branchId) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('id')
    .eq('branch_id', branchId)
    .gte('checked_at', monday.toISOString())
    .limit(1)
  if (error) return false
  return (data || []).length > 0
}

export async function getLastCheckInfo(branchId) {
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('checked_at, checked_by, profiles!checked_by(full_name)')
    .eq('branch_id', branchId)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return {
    checked_at: data.checked_at,
    checked_by_name: data.profiles?.full_name || null,
  }
}

export async function saveStockCheckSession(branchId, entries, userId) {
  // entries: [{ item_id, status, qty, unit, note }]
  const rows = entries.map(e => ({
    branch_id: branchId,
    item_id: e.item_id,
    status: e.status,
    qty: e.qty || null,
    unit: e.unit || null,
    note: e.note || null,
    checked_by: userId,
    checked_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('stock_check_entries').insert(rows)
  if (error) throw error
}

export async function createStockCheckItem(data) {
  const { data: result, error } = await supabase
    .from('stock_check_items')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return result
}

export async function updateStockCheckItem(id, updates) {
  const { data, error } = await supabase
    .from('stock_check_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStockCheckItem(id) {
  const { error } = await supabase
    .from('stock_check_items')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

export async function getStockCheckReminder(branchId) {
  const { data, error } = await supabase
    .from('stock_check_reminders')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle()
  if (error) return null
  return data
}

export async function upsertStockCheckReminder(branchId, updates) {
  const { error } = await supabase
    .from('stock_check_reminders')
    .upsert({ branch_id: branchId, ...updates, updated_at: new Date().toISOString() },
             { onConflict: 'branch_id' })
  if (error) throw error
}

// ── All-locations stock check ──────────────────────────────────

export async function getAllStockCheckItems() {
  const { data, error } = await supabase
    .from('stock_check_items')
    .select('*, pos_branches(id, name)')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data || [])
    .map(item => ({ ...item, branch_name: item.pos_branches?.name || '' }))
    .sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) ||
      a.sort_order - b.sort_order
    )
}

export async function getAllLatestStockEntries() {
  const { data, error } = await supabase
    .from('stock_check_entries')
    .select('*')
    .order('checked_at', { ascending: false })
  if (error) throw error
  const map = {}
  for (const entry of data || []) {
    if (!map[entry.item_id]) map[entry.item_id] = entry
  }
  return map
}

export async function bulkSaveStockEntries(entries, userId) {
  // entries: [{ item_id, branch_id, status, qty, unit, note }]
  const rows = entries.map(e => ({
    branch_id: e.branch_id,
    item_id:   e.item_id,
    status:    e.status,
    qty:       e.qty || null,
    unit:      e.unit || null,
    note:      e.note || null,
    checked_by:  userId,
    checked_at:  new Date().toISOString(),
  }))
  const { error } = await supabase.from('stock_check_entries').insert(rows)
  if (error) throw error
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
