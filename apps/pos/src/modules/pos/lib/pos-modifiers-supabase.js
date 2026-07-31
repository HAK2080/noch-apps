// pos-modifiers-supabase.js — Product modifier groups domain
// Extracted from pos-supabase.js (Modifiers section). Follows exact pattern from src/lib/supabase.js

import { supabase } from '../../../lib/supabase'

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
