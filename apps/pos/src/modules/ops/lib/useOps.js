// useOps.js — ops_settings hook.
//
// Refresh strategy: settings are fetched once at mount, then revalidated on
// document focus (tab-switch / app-resume on the tablet) AND on a 60s poll.
// This is the simplest mechanism consistent with the rest of the PWA, which
// already reloads its caches on visibilitychange. No realtime subscription
// is needed for settings-rate changes.

import { useEffect, useState, useCallback } from 'react'
import { getOpsSettings } from './ops-supabase'

let cachedSettings = null
let lastFetchedAt = 0
let pendingSettings = null
const SETTINGS_TTL_MS = 60_000

async function loadSharedSettings(force = false) {
  if (pendingSettings) return pendingSettings
  if (!force && lastFetchedAt && Date.now() - lastFetchedAt < SETTINGS_TTL_MS) return cachedSettings
  pendingSettings = getOpsSettings().then(settings => {
    cachedSettings = settings
    lastFetchedAt = Date.now()
    return settings
  }).finally(() => { pendingSettings = null })
  return pendingSettings
}

export function useOpsSettings() {
  const [settings, setSettings] = useState(cachedSettings)
  const [loading, setLoading] = useState(!lastFetchedAt)

  const refresh = useCallback(async (force = false) => {
    try {
      const s = await loadSharedSettings(force)
      setSettings(s)
    } catch {
      // Keep the last known setting through a transient network failure.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    const interval = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(interval)
    }
  }, [refresh])

  return { settings, loading, refresh: () => refresh(true), moduleEnabled: !!settings?.module_enabled }
}
