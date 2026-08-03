export const SUPPORTED_ROLES = ['supervisor', 'accountant', 'staff', 'limited_staff']

export const ROLE_LABELS = {
  owner: { en: 'Owner', ar: 'المالك' },
  supervisor: { en: 'Supervisor', ar: 'مشرف' },
  accountant: { en: 'Accountant', ar: 'محاسب' },
  staff: { en: 'Staff', ar: 'موظف' },
  limited_staff: { en: 'Limited staff', ar: 'موظف بصلاحيات محدودة' },
  data_entry: { en: 'Archived data-entry role', ar: 'دور إدخال بيانات مؤرشف' },
}

export const AUTH_POLICY = Object.freeze({ type: 'authenticated' })
export const OWNER_POLICY = Object.freeze({ type: 'owner' })

export function featurePolicy(feature, mode = 'access') {
  return { type: 'feature', feature, mode }
}

export function isAccountEnabled(profile) {
  if (!profile) return false
  // Compatibility for profiles created before access_enabled was introduced.
  return profile.role === 'owner' || profile.access_enabled !== false
}

export function canAccessPolicy(policy, { profile, permissions = {}, isOwner = false } = {}) {
  if (!profile || !isAccountEnabled(profile)) return false
  if (!policy || policy.type === 'authenticated') return true
  if (isOwner || profile.role === 'owner' || permissions.all?.can_access) return true
  if (policy.type === 'owner') return false
  if (policy.type !== 'feature' || !policy.feature) return false

  const grant = permissions[policy.feature]
  return policy.mode === 'edit' ? !!grant?.can_edit : !!grant?.can_access
}

const LANDING_CANDIDATES = [
  ['/pos', featurePolicy('pos')],
  ['/dashboard', featurePolicy('dashboard')],
  ['/expenses', featurePolicy('expenses')],
  ['/inventory', featurePolicy('inventory')],
  ['/my-tasks', AUTH_POLICY],
]

export function getLandingRoute(context) {
  if (context?.isOwner || context?.profile?.role === 'owner') return '/dashboard'
  return LANDING_CANDIDATES.find(([, policy]) => canAccessPolicy(policy, context))?.[0] || '/staff/my-profile'
}

export function roleLabel(role, lang = 'en') {
  return ROLE_LABELS[role]?.[lang] || role?.replaceAll('_', ' ') || '—'
}
