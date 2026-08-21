const PROFILE_CACHE_PREFIX = 'noch-auth-profile:'
const PROFILE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function cacheProfile(userId, profile, storage = globalThis.localStorage) {
  if (!userId || !profile || !storage) return
  try {
    storage.setItem(`${PROFILE_CACHE_PREFIX}${userId}`, JSON.stringify({
      user_id: userId,
      cached_at: Date.now(),
      profile,
    }))
  } catch { /* storage is optional */ }
}

export function getCachedProfile(userId, storage = globalThis.localStorage, now = Date.now()) {
  if (!userId || !storage) return null
  try {
    const cached = JSON.parse(storage.getItem(`${PROFILE_CACHE_PREFIX}${userId}`) || 'null')
    if (!cached || cached.user_id !== userId || !cached.profile) return null
    if (now - Number(cached.cached_at || 0) > PROFILE_CACHE_MAX_AGE_MS) return null
    return cached.profile
  } catch {
    return null
  }
}
