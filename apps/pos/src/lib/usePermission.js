// usePermission.js — adapter so legacy call sites that use can(feature, action)
// keep working while routing through the canonical role-based permission system
// (PermissionsContext + role_permissions table with role/feature/can_access/can_edit).
//
// Usage: const can = usePermission()
//        can('pos', 'void_order') → boolean

import { usePermissions } from '../contexts/PermissionsContext'

// Map legacy (feature, action) keys → role_permissions feature row + which flag.
// 'edit' → reads can_edit; 'access' (or anything else) → reads can_access.
// `null` value means owner-only (no row in role_permissions covers it).
const ACTION_MAP = {
  'pos.discount_any':       ['pos_discounts', 'access'],
  'pos.void_order':         ['pos_void',      'access'],
  'pos.end_of_day':         ['pos_eod',       'access'],
  'pos.discounts':          ['pos_discounts', 'access'],
  'staff.edit':             ['staff',         'edit'],
  'staff.salaries':         ['staff_salaries','access'],
  'role_management.manage': null, // owner-only
  'analytics.view':         ['analytics',     'access'],
  'analytics.financial':    ['analytics',     'edit'],
}

export function usePermission() {
  const { hasAccess, canEdit, isOwner } = usePermissions()
  return (feature, action) => {
    if (isOwner) return true
    const key = `${feature}.${action}`
    const map = ACTION_MAP[key]
    if (map === null) return false       // owner-only
    if (!map) return hasAccess(feature)  // fallback to plain feature access
    const [feat, flag] = map
    return flag === 'edit' ? canEdit(feat) : hasAccess(feat)
  }
}

export default usePermission
