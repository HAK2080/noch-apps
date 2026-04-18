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

export async function getPOSCategories(branchId) {
  const { data, error } = await supabase
    .from('pos_categories')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order')
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
  const { data, error } = await supabase
    .from('pos_products')
    .select('*, pos_categories(name, name_ar, color)')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
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
  const { data, error } = await supabase
    .from('pos_shifts')
    .update({
      ...closeData,
      closed_at: new Date().toISOString(),
      status: 'closed',
    })
    .eq('id', shiftId)
    .select()
    .single()
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

export async function createPOSOrder(orderData, items) {
  // 1. Generate order number
  const branch = await getPOSBranch(orderData.branch_id)
  const branchCode = getBranchCode(branch.name)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  // Count today's orders for sequence
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('pos_orders')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', orderData.branch_id)
    .gte('created_at', startOfDay.toISOString())
  const seq = String((count || 0) + 1).padStart(4, '0')
  const orderNumber = `${branchCode}-${dateStr}-${seq}`

  // 2. Insert order
  const { data: order, error: orderErr } = await supabase
    .from('pos_orders')
    .insert({ ...orderData, order_number: orderNumber })
    .select()
    .single()
  if (orderErr) throw orderErr

  // 3. Insert order items
  const itemsWithOrderId = items.map(item => ({
    order_id: order.id,
    product_id: item.product_id || null,
    product_name: item.product_name,
    product_name_ar: item.product_name_ar || null,
    unit_price: item.unit_price,
    quantity: item.quantity,
    total: item.unit_price * item.quantity,
    notes: item.notes || null,
  }))

  const { error: itemsErr } = await supabase
    .from('pos_order_items')
    .insert(itemsWithOrderId)
  if (itemsErr) throw itemsErr

  // 4. Update inventory & create movement records
  for (const item of items) {
    if (!item.product_id || !item.track_inventory) continue
    const { data: product } = await supabase
      .from('pos_products')
      .select('stock_qty')
      .eq('id', item.product_id)
      .single()
    if (!product) continue
    const stockBefore = parseFloat(product.stock_qty)
    const stockAfter = stockBefore - item.quantity
    await supabase
      .from('pos_products')
      .update({ stock_qty: stockAfter, updated_at: new Date().toISOString() })
      .eq('id', item.product_id)
    await supabase
      .from('pos_inventory_movements')
      .insert({
        branch_id: orderData.branch_id,
        product_id: item.product_id,
        movement_type: 'sale',
        quantity: -item.quantity,
        stock_before: stockBefore,
        stock_after: stockAfter,
        reference_id: order.id,
        notes: `Order ${orderNumber}`,
      })
  }

  // 5. Update shift totals
  if (orderData.shift_id) {
    const method = orderData.payment_method
    const isCash = method === 'cash' || method === 'split'
    const isCard = method === 'card' || method === 'split' || method === 'presto'
    const cashAmt = method === 'cash'
      ? parseFloat(orderData.total)
      : method === 'split'
      ? parseFloat(orderData.total) - parseFloat(orderData.card_amount || 0)
      : 0
    const cardAmt = (method === 'card' || method === 'presto')
      ? parseFloat(orderData.total)
      : parseFloat(orderData.card_amount || 0)

    const { data: shift } = await supabase
      .from('pos_shifts')
      .select('total_sales, total_orders, total_cash_sales, total_card_sales, total_discounts, expected_cash')
      .eq('id', orderData.shift_id)
      .single()
    if (shift) {
      await supabase
        .from('pos_shifts')
        .update({
          total_sales: parseFloat(shift.total_sales) + parseFloat(orderData.total),
          total_orders: shift.total_orders + 1,
          total_cash_sales: parseFloat(shift.total_cash_sales) + cashAmt,
          total_card_sales: parseFloat(shift.total_card_sales) + cardAmt,
          total_discounts: parseFloat(shift.total_discounts) + parseFloat(orderData.discount_amount || 0),
          expected_cash: parseFloat(shift.expected_cash) + cashAmt,
        })
        .eq('id', orderData.shift_id)
    }
  }

  // 6. Return complete order with items
  const { data: fullOrder } = await supabase
    .from('pos_orders')
    .select('*, pos_order_items(*)')
    .eq('id', order.id)
    .single()
  return fullOrder || order
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

export async function voidPOSOrder(orderId, reason) {
  const { data, error } = await supabase
    .from('pos_orders')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      void_reason: reason,
    })
    .eq('id', orderId)
    .select()
    .single()
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
