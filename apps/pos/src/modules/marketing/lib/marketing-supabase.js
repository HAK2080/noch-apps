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

// ── Campaigns ───────────────────────────────────────────────────────
export async function listCampaigns() {
  const { data, error } = await supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function createCampaign(row) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('marketing_campaigns').insert({ ...row, created_by: user?.id }).select().single()
  if (error) throw error
  return data
}
export async function updateCampaign(id, updates) {
  const { data, error } = await supabase.from('marketing_campaigns').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Recipients of a campaign (computed fresh from the chosen segment).
// Phase 6 segments (birthday/inactive/reward_ready) are consent-gated:
// they ONLY return rows where whatsapp_opt_in = true. The legacy RFM
// segments still use the older marketing_opt_in flag for backward compat
// — set channel to 'whatsapp' to force the consent-gated path.
export async function loadSegmentRecipients(segment, opts = {}) {
  // Phase 6 — explicit WhatsApp segments backed by RPCs that already
  // filter to whatsapp_opt_in = true.
  if (segment === 'birthday_this_week') {
    const { data, error } = await supabase.rpc('wa_segment_birthday_this_week')
    if (error) throw error
    return (data || []).map(r => ({
      id: r.customer_id, full_name: r.full_name, phone: r.phone,
      top_drink: r.top_drink, context: { birthday_day: r.birthday_day, birthday_month: r.birthday_month },
    }))
  }
  if (segment === 'inactive') {
    const days = Number(opts.days) > 0 ? Number(opts.days) : 30
    const { data, error } = await supabase.rpc('wa_segment_inactive', { p_days: days })
    if (error) throw error
    return (data || []).map(r => ({
      id: r.customer_id, full_name: r.full_name, phone: r.phone,
      top_drink: r.top_drink, context: { days_since: r.days_since, total_visits: r.total_visits },
    }))
  }
  if (segment === 'reward_ready') {
    const { data, error } = await supabase.rpc('wa_segment_reward_ready')
    if (error) throw error
    return (data || []).map(r => ({
      id: r.customer_id, full_name: r.full_name, phone: r.phone,
      top_drink: r.top_drink, context: { reward_count: r.reward_count, oldest_pending: r.oldest_pending },
    }))
  }

  // Legacy RFM path (vip / regular / at_risk / etc.) — used by older
  // campaigns; still respects marketing_opt_in but NOT whatsapp_opt_in.
  if (segment === 'all') {
    const { data } = await supabase.from('loyalty_customers').select('id, full_name, phone, phone_normalised').eq('marketing_opt_in', true).limit(500)
    return (data || []).map(r => ({ id: r.id, full_name: r.full_name, phone: r.phone || r.phone_normalised }))
  }
  const { data, error } = await supabase
    .from('customer_segments')
    .select('customer_id, loyalty_customers!customer_id(id, full_name, phone, phone_normalised, marketing_opt_in)')
    .eq('segment', segment)
  if (error) throw error
  return (data || [])
    .filter(r => r.loyalty_customers?.marketing_opt_in !== false)
    .map(r => ({
      id: r.loyalty_customers.id,
      full_name: r.loyalty_customers.full_name,
      phone: r.loyalty_customers.phone || r.loyalty_customers.phone_normalised,
    }))
}

// Phase 6 — render a message template against a recipient row, supporting
// {{name}}, {{drink}}, and a couple of segment-specific placeholders.
export function renderTemplate(template, recipient) {
  if (!template) return ''
  return String(template)
    .replaceAll('{{name}}',  recipient?.full_name || '')
    .replaceAll('{{drink}}', recipient?.top_drink || '')
    .replaceAll('{{days}}',  String(recipient?.context?.days_since ?? ''))
}

// Phase 6 — dispatch a WhatsApp campaign by looping through the chosen
// segment's recipients and invoking the send-whatsapp edge function.
// Each send is logged via record_whatsapp_send for dedupe + audit.
// Returns { sent, failed, total } when the loop finishes.
export async function dispatchWhatsAppCampaign({ campaignId, segment, segmentArgs, template, onProgress }) {
  const recipients = await loadSegmentRecipients(segment, segmentArgs || {})
  const total = recipients.length
  let sent = 0, failed = 0

  // Mark campaign as "sending" with a started_at stamp.
  if (campaignId) {
    await supabase.from('marketing_campaigns')
      .update({ status: 'sending', send_started_at: new Date().toISOString(), recipients_count: total })
      .eq('id', campaignId)
  }

  for (const r of recipients) {
    const message = renderTemplate(template, r)
    let status = 'sent', error = null
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('send-whatsapp', {
        body: { to: r.phone, message },
      })
      if (invokeErr) { status = 'failed'; error = invokeErr.message || 'invoke_failed' }
      else if (data?.error) { status = 'failed'; error = data.error }
    } catch (err) {
      status = 'failed'; error = err.message || 'exception'
    }

    if (status === 'sent') sent++; else failed++

    // Log for dedupe + audit. Trigger name = `campaign:<segment>` so the
    // existing whatsapp_sends history table holds the full picture.
    try {
      await supabase.rpc('record_whatsapp_send', {
        p_customer_id: r.id,
        p_phone:       r.phone,
        p_template:    template?.slice(0, 200) || null,
        p_trigger:     `campaign:${segment}`,
        p_status:      status,
        p_error:       error,
        p_payload_key: campaignId ? `campaign:${campaignId}:${r.id}` : null,
      })
    } catch {
      // Don't let audit-log failure block the loop.
    }

    if (onProgress) onProgress({ recipient: r, status, error, sent, failed, total })
  }

  if (campaignId) {
    await supabase.from('marketing_campaigns')
      .update({
        status: failed === 0 ? 'sent' : (sent === 0 ? 'failed' : 'sent'),
        send_finished_at: new Date().toISOString(),
        sent_count: sent,
        failed_count: failed,
      })
      .eq('id', campaignId)
  }

  return { sent, failed, total }
}

// ── Owner insights (Phase 8) ─────────────────────────────────────────
export async function ownerInsightsTopReturning(days = 30, limit = 10) {
  const { data, error } = await supabase.rpc('owner_insights_top_returning', { p_days: days, p_limit: limit })
  if (error) throw error
  return data || []
}
export async function ownerInsightsNearReward(threshold = 2, limit = 20) {
  const { data, error } = await supabase.rpc('owner_insights_near_reward', { p_threshold: threshold, p_limit: limit })
  if (error) throw error
  return data || []
}
export async function ownerInsightsTopDrinks(limit = 10) {
  const { data, error } = await supabase.rpc('owner_insights_top_drinks', { p_limit: limit })
  if (error) throw error
  return data || []
}

// ── Challenges (Phase 9) ─────────────────────────────────────────────
export async function listChallenges(opts = { activeOnly: false }) {
  let q = supabase.from('nochi_challenges').select('*').order('starts_at', { ascending: false })
  if (opts.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
export async function createChallenge(row) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('nochi_challenges').insert({ ...row, created_by: user?.id }).select().single()
  if (error) throw error
  return data
}
export async function updateChallenge(id, updates) {
  const { data, error } = await supabase.from('nochi_challenges').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── UGC moderation (Phase 7) ─────────────────────────────────────────
export async function listUgcSubmissions(status = null) {
  let q = supabase.from('ugc_submissions').select(`
    id, customer_id, photo_url, caption, handle, display_name, consent,
    status, rejection_reason, created_at, reviewed_at,
    loyalty_customers!customer_id ( full_name, phone, tier )
  `).order('created_at', { ascending: false }).limit(200)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function approveUgc(id, displayName) {
  const { data, error } = await supabase.rpc('approve_ugc', {
    p_id: id, p_display_name: displayName || null,
  })
  if (error) throw error
  return data
}

export async function rejectUgc(id, reason) {
  const { data, error } = await supabase.rpc('reject_ugc', {
    p_id: id, p_reason: reason || null,
  })
  if (error) throw error
  return data
}

export async function approveCampaign(id) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Reviews / reputation ───────────────────────────────────────────
export async function listReviews({ status = null } = {}) {
  let q = supabase.from('marketing_reviews').select('*').order('posted_at', { ascending: false }).limit(200)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
export async function createReview(row) {
  const { data, error } = await supabase.from('marketing_reviews').insert(row).select().single()
  if (error) throw error
  return data
}
export async function updateReview(id, updates) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const payload = { ...updates }
  if (updates.reply_text) {
    payload.replied_at = new Date().toISOString()
    payload.replied_by = user?.id
    payload.status = 'replied'
  }
  const { data, error } = await supabase.from('marketing_reviews').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Content calendar (read-only over content_posts) ────────────────
export async function listContentCalendar({ from, to } = {}) {
  let q = supabase.from('content_posts')
    .select('id, brand_id, format, platform, caption_final, image_url, status, scheduled_at, published_at, score_total')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
  if (from) q = q.gte('scheduled_at', from)
  if (to)   q = q.lte('scheduled_at', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
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
