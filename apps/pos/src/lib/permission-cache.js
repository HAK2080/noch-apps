const PERMISSION_CACHE_PREFIX = 'noch-role-permissions:'
const PERMISSION_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function cacheRolePermissions(role, permissions, storage = globalThis.localStorage) {
  if (!role || !permissions || !storage) return
  try {
    storage.setItem(`${PERMISSION_CACHE_PREFIX}${role}`, JSON.stringify({
      role,
      cached_at: Date.now(),
      permissions,
    }))
  } catch { /* storage is optional */ }
}

export function getCachedRolePermissions(role, storage = globalThis.localStorage, now = Date.now()) {
  if (!role || !storage) return null
  try {
    const cached = JSON.parse(storage.getItem(`${PERMISSION_CACHE_PREFIX}${role}`) || 'null')
    if (!cached || cached.role !== role || !cached.permissions) return null
    if (now - Number(cached.cached_at || 0) > PERMISSION_CACHE_MAX_AGE_MS) return null
    return cached.permissions
  } catch {
    return null
  }
}
