// marketing-supabase.js — all data access for the Marketing module.
// Reads from migrations 20260508020000_marketing_mvp.sql.

import { supabase } from '../../../lib/supabase'

// ── Channel snapshots ────────────────────────────────────────────────
export async function listChannelSnapshots({ channel = null, from, to } = {}) {
  let q = supabase.from('marketing_channel_snapshots').select('*').order('snapshot_date', { ascending: false })
  if (channel) q = q.eq('channel', channel)
  if (from) q = q.gte('snapshot_date', from)
  if (to)   q = q.lte('snapshot_date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createChannelSnapshot(s) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const payload = { ...s, source: s.source || 'manual', created_by: user?.id }
  const { data, error } = await supabase
    .from('marketing_channel_snapshots')
    .upsert(payload, { onConflict: 'channel,coalesce(account_label, ""),snapshot_date', ignoreDuplicates: false })
    .select()
  if (error) throw error
  return data?.[0]
}

// ── Segments ─────────────────────────────────────────────────────────
export async function listSegments() {
  // Pull customer_segments with the customer record joined for display.
  const { data, error } = await supabase
    .from('customer_segments')
    .select(`*, loyalty_customers!customer_id(
      id, full_name, phone, phone_normalised, marketing_opt_in,
      birthday, tier, current_stamps, total_stamps, total_visits, last_visit_at
    )`)
    .order('rfm_composite', { ascending: false })
  if (error) throw error
  return data || []
}

export async function refreshSegments() {
  const { data, error } = await supabase.rpc('refresh_customer_segments')
  if (error) throw error
  return data
}

// Get segment + RFM for a single customer (for the loyalty profile extension).
export async function getCustomerSegment(customerId) {
  const { data, error } = await supabase
    .from('customer_segments')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── Cohorts ──────────────────────────────────────────────────────────
export async function getCohortRetention(months = 6) {
  const { data, error } = await supabase.rpc('cohort_retention', { p_months: months })
  if (error) throw error
  return data || []
}

// ── Duplicates ──────────────────────────────────────────────────────
export async function listLoyaltyDuplicates() {
  const { data, error } = await supabase
    .from('loyalty_customer_duplicates')
    .select('*')
  if (error) throw error
  return data || []
}

// ── Whatsapp sends (for the WhatsApp channel section) ──────────────
export async function getWhatsappStats({ from, to } = {}) {
  let q = supabase.from('whatsapp_sends').select('id, status, created_at, trigger_name')
  if (from) q = q.gte('created_at', from)
  if (to)   q = q.lte('created_at', to)
  const { data, error } = await q
  if (error) {
    // Table may not exist on older schemas; soft-fail.
    return { sent: 0, delivered: 0, read: 0, failed: 0, total: 0 }
  }
  const out = { sent: 0, delivered: 0, read: 0, failed: 0, total: data.length }
  for (const r of data) {
    if (r.status === 'failed') out.failed++
    else if (r.status === 'read') { out.read++; out.delivered++; out.sent++ }
    else if (r.status === 'delivered') { out.delivered++; out.sent++ }
    else { out.sent++ }
  }
  return out
}

// ── % of orders linked to loyalty (health metric for top of Customers) ──
export async function loyaltyLinkRate({ from, to } = {}) {
  let qTotal = supabase.from('pos_orders').select('id', { count: 'exact', head: true }).eq('status', 'completed')
  let qLinked = supabase.from('pos_orders').select('id', { count: 'exact', head: true }).eq('status', 'completed').not('loyalty_customer_id', 'is', null)
  if (from) { qTotal = qTotal.gte('created_at', from); qLinked = qLinked.gte('created_at', from) }
  if (to)   { qTotal = qTotal.lte('created_at', to);   qLinked = qLinked.lte('created_at', to) }
  const [{ count: total }, { count: linked }] = await Promise.all([qTotal, qLinked])
  const tot = total || 0
  const lnk = linked || 0
  return { total: tot, linked: lnk, pct: tot > 0 ? lnk / tot : 0 }
}
