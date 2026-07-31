import { supabase } from '../../../lib/supabase'

// ============================================================
// LOYALTY SYSTEM — Nochi V3.01
// ============================================================

export async function getLoyaltyStats() {
  const { data, error } = await supabase.rpc('get_loyalty_stats')
  // Table/function doesn't exist yet (migration not run) — return null gracefully
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883' || error.message?.includes('does not exist')) return null
    throw error
  }
  return data
}

export async function getLoyaltySettings() {
  const { data, error } = await supabase.from('loyalty_settings').select('*').limit(1).single()
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return null
    throw error
  }
  return data
}

export async function updateLoyaltySettings(settings) {
  const { id } = settings
  const updates = { ...settings }
  delete updates.id
  delete updates.created_at
  const { data, error } = await supabase
    .from('loyalty_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

export async function getLoyaltyCustomers(filters = {}) {
  let query = supabase
    .from('loyalty_customers')
    .select('*')
    .order('last_visit_at', { ascending: false, nullsFirst: false })

  if (filters.nochi_state) {
    if (Array.isArray(filters.nochi_state)) {
      query = query.in('nochi_state', filters.nochi_state)
    } else {
      query = query.eq('nochi_state', filters.nochi_state)
    }
  }
  if (filters.tier) query = query.eq('tier', filters.tier)

  const { data, error } = await query
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return []
    throw error
  }
  return data
}

export async function getLoyaltyCustomer(id) {
  const { data, error } = await supabase
    .from('loyalty_customers')
    .select(`*, stamps:loyalty_stamps(*), rewards:loyalty_rewards(*), feedback:loyalty_feedback(*)`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function registerLoyaltyCustomer(customer) {
  const { data, error } = await supabase
    .from('loyalty_customers')
    .insert(customer)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLoyaltyCustomer(id) {
  const { error } = await supabase.from('loyalty_customers').delete().eq('id', id)
  if (error) throw error
}

// Admin (owner/staff) stamp grant — calls the RPC directly so we can tag the
// activity (reason → loyalty_stamps.notes). The QR self-scan path still uses the
// loyalty-stamp edge function elsewhere.
export async function awardLoyaltyStamp(customerId, awardedBy, reason = null) {
  const { data, error } = await supabase.rpc('award_loyalty_stamp', {
    p_customer_id: customerId,
    p_awarded_by: awardedBy || null,
    p_reason: reason || null,
  })
  if (error) throw new Error(error.message ?? 'Failed to award stamp')
  if (data?.error) throw new Error(data.error)
  return data
}

// Activity labels for the stamp-grant WhatsApp message.
const STAMP_ACTIVITY_LABELS = {
  ugc:   { ar: 'المنشور', en: 'your post' },
  review:{ ar: 'التقييم', en: 'your review' },
  visit: { ar: 'زيارتك', en: 'your visit' },
}

// Optional WhatsApp thank-you when a stamp is granted for an activity.
// Gated by settings + per-activity flag + the customer's whatsapp_opt_in.
// Never throws — returns a result object the caller can toast.
export async function notifyStampGranted(customer, activity) {
  try {
    if (!customer?.phone) return { skipped: true, reason: 'no_phone' }
    if (customer.whatsapp_opt_in === false) return { skipped: true, reason: 'not_opted_in' }

    const settings = await getLoyaltySettings()
    if (!settings?.stamp_notify_enabled) return { skipped: true, reason: 'disabled' }
    if (activity === 'ugc' && !settings.stamp_notify_ugc) return { skipped: true, reason: 'activity_off' }
    if (activity === 'review' && !settings.stamp_notify_review) return { skipped: true, reason: 'activity_off' }

    const lang = customer.preferred_language === 'en' ? 'en' : 'ar'
    const label = (STAMP_ACTIVITY_LABELS[activity] || STAMP_ACTIVITY_LABELS.visit)[lang]

    // Prefer an approved Content API template (proactive-safe); else free-form.
    let body
    if (settings.stamp_notify_template_sid) {
      body = { to: customer.phone, contentSid: settings.stamp_notify_template_sid, contentVariables: { '1': label } }
    } else {
      const tmpl = (lang === 'en' ? settings.stamp_notify_message_en : settings.stamp_notify_message_ar) || ''
      body = { to: customer.phone, message: tmpl.replace(/\$\{activity\}/g, label) }
    }
    const { data, error } = await supabase.functions.invoke('send-whatsapp', { body })
    const ok = !error && !data?.error
    // Audit log (best-effort).
    supabase.rpc('record_whatsapp_send', {
      p_customer_id: customer.id, p_phone: customer.phone,
      p_template: 'stamp_grant', p_trigger: `stamp_${activity}`,
      p_status: ok ? 'sent' : 'failed',
      p_error: ok ? null : (error?.message || data?.error || 'unknown'),
      p_payload_key: null,
    }).catch(() => {})

    if (!ok) return { skipped: false, sent: false, error: error?.message || data?.error }
    return { sent: true }
  } catch (e) {
    return { skipped: false, sent: false, error: e.message }
  }
}

// Passport Phase 1
export async function recordPosCustomerVisit(customerId, favoriteDrink = null) {
  if (!customerId) return null
  const { data, error } = await supabase.rpc('record_pos_customer_visit', {
    p_customer_id: customerId,
    p_favorite_drink: favoriteDrink,
  })
  if (error) throw error
  return data
}

export async function getPublicPassport(token) {
  const { data, error } = await supabase.rpc('get_public_passport', { p_token: token })
  if (error) throw error
  return data
}

// Phase 4 — staff resolves a Passport-token QR scanned at the counter.
// Returns the same shape CustomerSearchModal uses to attach a customer.
export async function lookupCustomerByPassportToken(token) {
  if (!token) return null
  const { data, error } = await supabase.rpc('lookup_customer_by_passport_token', { p_token: token })
  if (error) throw error
  return data
}

// Passport Phase 2
export async function updatePassportPreferences(token, phoneLast4, updates) {
  const { data, error } = await supabase.rpc('update_passport_preferences', {
    p_token: token,
    p_phone_last4: phoneLast4,
    p_updates: updates,
  })
  if (error) throw error
  return data
}

export async function getLoyaltyRewards(status = 'pending') {
  const { data, error } = await supabase
    .from('loyalty_rewards')
    .select('*, customer:loyalty_customers(full_name, phone)')
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function redeemLoyaltyReward(rewardId, redeemedBy) {
  const { data, error } = await supabase
    .from('loyalty_rewards')
    .update({ status: 'redeemed', redeemed_by: redeemedBy, redeemed_at: new Date().toISOString() })
    .eq('id', rewardId)
    .select().single()
  if (error) throw error
  return data
}

export async function sendLoyaltyNotification(customerId, type, vars = {}) {
  const { data, error } = await supabase.functions.invoke('loyalty-notify', {
    body: { customer_id: customerId, type, vars },
  })
  if (error) throw new Error(error.message ?? 'Failed to send notification')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function submitLoyaltyFeedback(customerId, rating, comment) {
  const { data, error } = await supabase.functions.invoke('loyalty-feedback', {
    body: { customer_id: customerId, rating, comment },
  })
  if (error) throw new Error(error.message ?? 'Failed to submit feedback')
  if (data?.error) throw new Error(data.error)
  return data
}

export async function lookupLoyaltyQR(qrToken) {
  const { data, error } = await supabase
    .from('loyalty_qr_tokens')
    .select('*, customer:loyalty_customers(*)')
    .eq('token', qrToken)
    .single()
  if (error) throw error
  return data?.customer || null
}

export async function lookupOrCreateLoyaltyCustomer(phone) {
  const { data, error } = await supabase.rpc('lookup_or_create_loyalty_customer', { p_phone: phone })
  if (error) throw error
  return data
}

export async function lookupOrCreateLoyaltyMemberV2(phone, fullName = null) {
  const { data, error } = await supabase.rpc('lookup_or_create_loyalty_member_v2', {
    p_phone: phone,
    p_full_name: fullName,
  })
  if (error) throw error
  return data
}

export async function createLoyaltyCheckoutV2(branchId, cartToken) {
  const { data, error } = await supabase.rpc('create_loyalty_checkout_v2', {
    p_branch_id: branchId,
    p_cart_token: cartToken,
  })
  if (error) throw error
  return data
}

export async function getLoyaltyCheckoutV2(sessionId) {
  const { data, error } = await supabase.rpc('get_loyalty_checkout_v2', {
    p_session_id: sessionId,
  })
  if (error) throw error
  return data
}

export async function closeLoyaltyCheckoutV2(sessionId, orderId = null, cancel = false) {
  if (!sessionId) return null
  const { data, error } = await supabase.rpc('close_loyalty_checkout_v2', {
    p_session_id: sessionId,
    p_order_id: orderId,
    p_cancel: cancel,
  })
  if (error) throw error
  return data
}

export async function getAvailableLoyaltyRewardsV2(customerId, branchId) {
  if (!customerId || !branchId) return []
  const { data, error } = await supabase.rpc('get_available_loyalty_rewards_v2', {
    p_customer_id: customerId,
    p_branch_id: branchId,
  })
  if (error) throw error
  return data || []
}

export async function redeemLoyaltyRewardV2(entitlementId, orderId, branchId) {
  const { data, error } = await supabase.rpc('redeem_loyalty_reward_v2', {
    p_entitlement_id: entitlementId,
    p_order_id: orderId,
    p_branch_id: branchId,
  })
  if (error) throw error
  return data
}

export async function getLoyaltyV2Dashboard() {
  const { data, error } = await supabase.rpc('get_loyalty_v2_dashboard')
  if (error) throw error
  return data
}

export async function getLoyaltyV1Archive() {
  const { data, error } = await supabase
    .from('loyalty_v1_customer_archive')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data || []
}

export async function getLoyaltyCheckoutMetrics(days = 30) {
  const { data, error } = await supabase.rpc('loyalty_checkout_metrics', { p_days: days })
  if (error) throw error
  return data
}

export async function getLoyaltyStaffLeaderboard(days = 30) {
  const { data, error } = await supabase.rpc('loyalty_staff_leaderboard', { p_days: days })
  if (error) throw error
  return data || []
}

export async function generateLoyaltyQR() {
  // Generate token directly in DB (no edge function needed)
  const token = 'NOCHI-' + Math.random().toString(36).substring(2, 7).toUpperCase()
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('loyalty_qr_tokens')
    .insert({ token, expires_at })
    .select()
    .single()
  if (error) throw new Error(error.message ?? 'Failed to generate QR')
  return { token: data.token, expires_at: data.expires_at, expires_in_seconds: 300 }
}

export async function getMyLoyaltyCard(userId) {
  // Find customer by their profile phone or linked account
  // For Phase 1: customer is linked by user profile
  const { data: profile } = await supabase.from('profiles').select('phone').eq('id', userId).single()
  if (!profile?.phone) return null

  const { data, error } = await supabase
    .from('loyalty_customers')
    .select('*, rewards:loyalty_rewards(*), stamps:loyalty_stamps(*)')
    .eq('phone', profile.phone)
    .single()
  if (error) return null
  return data
}

// ============================================================
// LOYALTY — gamification helpers
// ============================================================

export const awardPoints = async (customerId, points) => {
  try {
    const { error } = await supabase.rpc('increment_loyalty_points', { customer_id: customerId, points_to_add: points })
    if (error) throw error
  } catch {
    // fallback if RPC doesn't exist
    const { data: customer } = await supabase.from('loyalty_customers').select('points').eq('id', customerId).single()
    await supabase.from('loyalty_customers').update({ points: (customer?.points || 0) + points }).eq('id', customerId)
  }
}

export const getCustomerBadges = async (customerId) => {
  const { data, error } = await supabase.from('loyalty_customer_badges').select('*').eq('customer_id', customerId)
  if (error) throw error
  return data || []
}

export const awardBadge = async (customerId, badgeKey) => {
  const { error } = await supabase.from('loyalty_customer_badges').upsert({ customer_id: customerId, badge_key: badgeKey }, { onConflict: 'customer_id,badge_key', ignoreDuplicates: true })
  if (error) throw error
}

export const getSpinPrizes = async () => {
  const { data, error } = await supabase.from('loyalty_spin_prizes').select('*').eq('is_active', true)
  if (error) throw error
  return data || []
}

export const recordSpin = async (customerId, prizeId, resultLabel) => {
  const { data, error } = await supabase.from('loyalty_spins').insert({ customer_id: customerId, prize_id: prizeId, result_label: resultLabel }).select().single()
  if (error) throw error
  return data
}

export const getLastSpin = async (customerId) => {
  const { data } = await supabase.from('loyalty_spins').select('spun_at').eq('customer_id', customerId).order('spun_at', { ascending: false }).limit(1).single()
  return data?.spun_at || null
}

export const getGestures = async (types = []) => {
  let query = supabase.from('loyalty_gestures').select('*').eq('is_active', true)
  if (types.length > 0) query = query.in('content_type', types)
  const { data, error } = await query
  if (error) throw error
  return data || []
}
