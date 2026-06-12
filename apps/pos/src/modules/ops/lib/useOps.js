// useOps.js — ops_settings hook.
//
// Refresh strategy: settings are fetched once at mount, then revalidated on
// document focus (tab-switch / app-resume on the tablet) AND on a 60s poll.
// This is the simplest mechanism consistent with the rest of the PWA, which
// already reloads its caches on visibilitychange. No realtime subscription
// is needed for settings-rate changes.

import { useEffect, useState, useCallback } from 'react'
import { getOpsSettings } from './ops-supabase'

export function useOpsSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const s = await getOpsSettings()
      setSettings(s)
    } catch {
      setSettings(null)
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

  return { settings, loading, refresh, moduleEnabled: !!settings?.module_enabled }
}
