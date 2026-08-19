// pos-shift-supabase.js — Shift lifecycle domain (open/close, cash movements, attendees)
// Extracted from pos-supabase.js (Shifts section). Follows exact pattern from src/lib/supabase.js

import { supabase } from '../../../lib/supabase'

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

export async function getShiftReport(shiftId) {
  return getShiftSummary(shiftId)
}
