// signals.js — Phase 3 derived signals from POS + loyalty.
// All client-side: small queries against existing tables, no SQL added.
// Each signal returns a uniform card shape consumed by Signals.jsx.

import { supabase } from '../../../lib/supabase'

// Card shape: {
//   id, signal_source: 'pos' | 'loyalty', kind, title, explanation,
//   suggested_mission, suggested_audience, suggested_product,
//   suggested_nochi_format, count, severity ('info'|'good'|'warn')
// }

// ──────────────────────────────────────────────────────────────
// POS signals
// ──────────────────────────────────────────────────────────────

export async function loadPosSignals() {
  const out = []
  const since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
  const since7  = new Date(Date.now() - 7  * 86400 * 1000).toISOString()
  const since60 = new Date(Date.now() - 60 * 86400 * 1000).toISOString()

  // Per-product order-item counts in last 30 days vs 30 days before.
  const [recent, prev, products] = await Promise.all([
    supabase.from('pos_order_items')
      .select('product_id, product_name, quantity, pos_orders!inner(created_at, status)')
      .eq('pos_orders.status', 'completed')
      .gte('pos_orders.created_at', since30),
    supabase.from('pos_order_items')
      .select('product_id, product_name, quantity, pos_orders!inner(created_at, status)')
      .eq('pos_orders.status', 'completed')
      .gte('pos_orders.created_at', since60)
      .lt('pos_orders.created_at', since30),
    supabase.from('pos_products')
      .select('id, name, name_ar, is_active, created_at, stock_qty, low_stock_alert, track_inventory')
      .eq('is_active', true),
  ])

  if (recent.error || prev.error || products.error) {
    return { signals: [], error: recent.error || prev.error || products.error }
  }

  const aggBy = (rows) => {
    const m = new Map()
    for (const r of rows || []) {
      if (!r.product_id) continue
      const k = r.product_id
      m.set(k, (m.get(k) || 0) + (Number(r.quantity) || 0))
    }
    return m
  }
  const recentQty = aggBy(recent.data)
  const prevQty   = aggBy(prev.data)
  const nameById  = new Map((products.data || []).map(p => [p.id, p]))

  // Trending — qty in last 30d at least 1.5× the prior 30d AND >= 10 units.
  for (const [pid, qty] of recentQty.entries()) {
    const prevN = prevQty.get(pid) || 0
    if (qty >= 10 && prevN > 0 && qty >= 1.5 * prevN) {
      const p = nameById.get(pid)
      if (!p) continue
      out.push({
        id: `pos-trend-${pid}`,
        signal_source: 'pos', kind: 'trending_product', severity: 'good',
        title: `${p.name} is trending`,
        explanation: `Sold ${qty} in the last 30 days vs ${prevN} the 30 days before — up ${Math.round((qty / prevN - 1) * 100)}%.`,
        suggested_mission: `Capitalise on ${p.name} momentum — make Tripoli regulars feel they're part of the trend.`,
        suggested_audience: 'Existing regulars + curious first-timers',
        suggested_product: p.name,
        suggested_nochi_format: 'Behind the bar / Drink Drama',
        count: qty,
      })
    }
  }

  // Declining — was a top performer (>= 20 prior 30d) but recent qty <= 50% of prior.
  for (const [pid, prevN] of prevQty.entries()) {
    if (prevN < 20) continue
    const recentN = recentQty.get(pid) || 0
    if (recentN <= 0.5 * prevN) {
      const p = nameById.get(pid)
      if (!p) continue
      out.push({
        id: `pos-decline-${pid}`,
        signal_source: 'pos', kind: 'declining_product', severity: 'warn',
        title: `${p.name} is fading`,
        explanation: `${prevN} sold in days 30–60, but only ${recentN} in the last 30 days.`,
        suggested_mission: `Remind customers why they loved ${p.name} — angle that surfaces a forgotten favourite.`,
        suggested_audience: 'Lapsed buyers',
        suggested_product: p.name,
        suggested_nochi_format: 'Nochi Confession / Counter Talk',
        count: prevN,
      })
    }
  }

  // Low sales — active product, no orders in 30 days.
  const ordered = new Set(recentQty.keys())
  for (const p of products.data || []) {
    if (!ordered.has(p.id)) {
      // skip very-recently created (< 14d) — too early to call dead
      const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86400000
      if (ageDays < 14) continue
      out.push({
        id: `pos-low-${p.id}`,
        signal_source: 'pos', kind: 'low_sales', severity: 'warn',
        title: `${p.name} hasn't sold in 30 days`,
        explanation: 'Active on the menu but no orders in the last 30 days.',
        suggested_mission: `Re-introduce ${p.name} with a fresh angle — explain who it's for or pair it with a drink.`,
        suggested_audience: 'Tripoli regulars who haven\'t tried it',
        suggested_product: p.name,
        suggested_nochi_format: 'Educate / Explain',
        count: 0,
      })
    }
  }

  // New product needing awareness — created < 30d ago.
  for (const p of products.data || []) {
    const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86400000
    if (ageDays >= 0 && ageDays < 30) {
      const qty = recentQty.get(p.id) || 0
      out.push({
        id: `pos-new-${p.id}`,
        signal_source: 'pos', kind: 'new_product', severity: 'info',
        title: `${p.name} is new on the menu`,
        explanation: `Added ${Math.round(ageDays)} day${Math.round(ageDays) === 1 ? '' : 's'} ago. ${qty} sold so far — needs awareness.`,
        suggested_mission: `Welcome ${p.name} — story-tell why it's on the menu and who it's for.`,
        suggested_audience: 'Everyone',
        suggested_product: p.name,
        suggested_nochi_format: 'Drink of the Week',
        count: qty,
      })
    }
  }

  // Inventory pressure — track_inventory + below low_stock_alert.
  for (const p of products.data || []) {
    if (p.track_inventory && p.stock_qty != null && p.low_stock_alert != null
      && Number(p.stock_qty) <= Number(p.low_stock_alert)) {
      out.push({
        id: `pos-stock-${p.id}`,
        signal_source: 'pos', kind: 'stock_pressure', severity: 'warn',
        title: `${p.name} is running low`,
        explanation: `Stock ${p.stock_qty} ≤ alert ${p.low_stock_alert}. Last call energy.`,
        suggested_mission: `Create urgency around ${p.name} — "while it lasts".`,
        suggested_audience: 'All customers',
        suggested_product: p.name,
        suggested_nochi_format: 'Last Call / Limited Edition',
        count: Number(p.stock_qty),
      })
    }
  }

  return { signals: out, error: null }
}

// ──────────────────────────────────────────────────────────────
// Loyalty signals
// ──────────────────────────────────────────────────────────────

export async function loadLoyaltySignals() {
  const out = []

  const [customersRes, feedbackRes, rewardsRes] = await Promise.all([
    supabase.from('loyalty_customers')
      .select('id, full_name, tier, nochi_state, current_stamps, total_visits, last_visit_at, whatsapp_opt_in')
      .limit(1500),
    supabase.from('loyalty_feedback')
      .select('id, customer_id, rating, comment, visit_date, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('loyalty_rewards')
      .select('id, customer_id, status, expires_at, created_at')
      .eq('status', 'pending'),
  ])

  if (customersRes.error || feedbackRes.error || rewardsRes.error) {
    return { signals: [], error: customersRes.error || feedbackRes.error || rewardsRes.error }
  }
  const customers = customersRes.data || []
  const feedback  = feedbackRes.data  || []
  const rewards   = rewardsRes.data   || []

  // Inactive customers — last visit > 30 days
  const inactive = customers.filter(c => c.last_visit_at && Date.now() - new Date(c.last_visit_at).getTime() > 30 * 86400000)
  if (inactive.length > 0) {
    out.push({
      id: 'loyalty-inactive',
      signal_source: 'loyalty', kind: 'inactive_customers', severity: 'warn',
      title: `${inactive.length} regulars haven't visited in 30+ days`,
      explanation: 'Lapsed regulars need a soft reminder, not a hard sell.',
      suggested_mission: 'Win back lapsed regulars — Nochi voice, no pressure, warm welcome back.',
      suggested_audience: 'Inactive regulars (30+ days)',
      suggested_nochi_format: 'Nochi Misses You',
      count: inactive.length,
    })
  }

  // Nochi-state buckets (sad/tired/deathbed)
  const states = ['sad', 'tired', 'deathbed']
  for (const s of states) {
    const n = customers.filter(c => c.nochi_state === s).length
    if (n === 0) continue
    out.push({
      id: `loyalty-nochi-${s}`,
      signal_source: 'loyalty', kind: `nochi_${s}`, severity: s === 'deathbed' ? 'warn' : 'info',
      title: `${n} customer${n === 1 ? '' : 's'} have ${s} Nochi`,
      explanation: `Nochi state '${s}' means they're slipping through stages of inactivity.`,
      suggested_mission: `Rescue ${s} Nochi customers — playful, not desperate.`,
      suggested_audience: `${s} Nochi customers`,
      suggested_nochi_format: 'Rescue Nochi',
      count: n,
    })
  }

  // Pending rewards
  if (rewards.length > 0) {
    out.push({
      id: 'loyalty-rewards-pending',
      signal_source: 'loyalty', kind: 'pending_rewards', severity: 'good',
      title: `${rewards.length} free drinks waiting to be claimed`,
      explanation: 'Customers with a pending reward come back at twice the rate of those without.',
      suggested_mission: 'Nudge reward-ready customers — celebrate, don\'t push.',
      suggested_audience: 'Customers with pending rewards',
      suggested_nochi_format: 'Reward ready / Free drink moment',
      count: rewards.length,
    })
  }

  // Gold / Legend tier
  const top = customers.filter(c => c.tier === 'gold' || c.tier === 'legend')
  if (top.length > 0) {
    out.push({
      id: 'loyalty-vip',
      signal_source: 'loyalty', kind: 'vip_tier', severity: 'good',
      title: `${top.length} gold/legend regulars`,
      explanation: 'These are your real fans — content that names them (anonymously) builds belonging.',
      suggested_mission: 'Celebrate the regulars without naming individuals.',
      suggested_audience: 'Gold + Legend tier',
      suggested_nochi_format: 'Hall of Fame / Regulars Club',
      count: top.length,
    })
  }

  // Feedback signals
  const positive = feedback.filter(f => Number(f.rating) >= 4)
  const negative = feedback.filter(f => Number(f.rating) <= 2)
  if (positive.length >= 3) {
    out.push({
      id: 'loyalty-positive-fb',
      signal_source: 'loyalty', kind: 'positive_feedback', severity: 'good',
      title: `${positive.length} recent positive reviews`,
      explanation: 'Quote-worthy customer love. Permission still required before naming anyone.',
      suggested_mission: 'Echo customer love back — let them speak for themselves.',
      suggested_audience: 'Tripoli food lovers',
      suggested_nochi_format: 'Customer voice / Counter Talk',
      count: positive.length,
    })
  }
  if (negative.length > 0) {
    out.push({
      id: 'loyalty-negative-fb',
      signal_source: 'loyalty', kind: 'negative_feedback', severity: 'warn',
      title: `${negative.length} recent low ratings`,
      explanation: 'Address quietly via service first; do not turn into content.',
      suggested_mission: 'Internal — review service, not a content opportunity.',
      suggested_audience: 'Internal',
      suggested_nochi_format: 'Internal review',
      count: negative.length,
    })
  }

  // Review request opportunity — 5-star feedback w/o google review yet (if column exists)
  // (skipped — column on loyalty_customers; depends on environment)

  return { signals: out, error: null }
}

export async function loadAllSignals() {
  const [pos, loyalty] = await Promise.all([loadPosSignals(), loadLoyaltySignals()])
  return {
    pos: pos.signals,
    loyalty: loyalty.signals,
    error: pos.error || loyalty.error,
  }
}
