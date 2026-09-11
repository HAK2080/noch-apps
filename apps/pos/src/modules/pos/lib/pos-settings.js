// pos-settings.js — per-branch feature flags. Backed by the pos_settings
// table seeded by migration 20260507020000.
//
// Defaults (matching the user's choices on 2026-05-07):
//   block_out_of_stock: false       (off — default to old behaviour)
//   manager_override_enabled: false (off — wired but not yet active)
//   per_barista_shift: false        (off — single-shift model still default)
//   require_pin: true               (PIN now mandatory for terminal access)

import { supabase } from '../../../lib/supabase'

const DEFAULTS = {
  block_out_of_stock: false,
  manager_override_enabled: false,
  per_barista_shift: false,
  require_pin: true,
  presto_enabled: false,
  block_duplicate_tabs: false,
}

const _cache = new Map()  // branchId → settings

export async function getPOSSettings(branchId, { fresh = false } = {}) {
  if (!branchId) return { ...DEFAULTS }
  if (!fresh && _cache.has(branchId)) return _cache.get(branchId)
  const { data, error } = await supabase
    .from('pos_settings')
    .select('*')
    .eq('branch_id', branchId)
    .maybeSingle()
  if (error) throw error
  const merged = { ...DEFAULTS, ...(data || {}) }
  _cache.set(branchId, merged)
  return merged
}

export async function updatePOSSettings(branchId, updates) {
  const { data, error } = await supabase
    .from('pos_settings')
    .upsert(
      { branch_id: branchId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'branch_id' }
    )
    .select()
    .single()
  if (error) throw error
  _cache.set(branchId, { ...DEFAULTS, ...data })
  // Notify terminal gates in this window and other tabs of this browser.
  window.dispatchEvent(new Event('pos-settings-changed'))
  try { localStorage.setItem('noch_pos_settings_changed', `${branchId}:${Date.now()}`) } catch { /* storage is optional */ }
  return data
}

export function clearPOSSettingsCache(branchId) {
  if (branchId) _cache.delete(branchId)
  else _cache.clear()
}
