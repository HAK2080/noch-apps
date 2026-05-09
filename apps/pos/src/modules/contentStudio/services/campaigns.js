// campaigns.js — Phase 6 content-campaigns service.
// Distinct from marketing campaigns (marketing_campaigns) — these are
// CONTENT campaigns that group briefs / drafts / bank items.

import { supabase } from '../../../lib/supabase'

const TABLE = 'cs_campaigns'

export const CAMPAIGN_STATUSES = ['planning', 'active', 'paused', 'completed', 'archived']

export async function listCampaigns({ businessId, status } = {}) {
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (businessId) q = q.eq('business_id', businessId)
  if (status)     q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getCampaign(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createCampaign(input) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  const { data, error } = await supabase.from(TABLE).insert({ ...input, created_by: user?.id }).select().single()
  if (error) throw error
  return data
}

export async function updateCampaign(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteCampaign(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

export function blankCampaign(overrides = {}) {
  return {
    name: '',
    goal: '',
    content_mission: '',
    audience_segment: '',
    product_focus: '',
    source_signal: '',
    start_date: null,
    end_date: null,
    platforms: [],
    content_pillars: [],
    status: 'planning',
    success_metric: '',
    notes: '',
    ...overrides,
  }
}
