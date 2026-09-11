import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPOSSettings } from '../lib/pos-settings'
import { getCachedBranchConfig, withPOSNetworkTimeout } from '../lib/pos-offline'
import { watchPOSInstance } from '../lib/pos-instance-lock'

export default function POSInstanceGate({ branchId, children }) {
  const [enabled, setEnabled] = useState(null)
  const [state, setState] = useState('loading')
  const [entered, setEntered] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    let checking = false
    let known = false
    const cacheKey = `noch_pos_duplicate_tabs:${branchId}`
    async function refresh() {
      if (checking) return
      checking = true
      try {
        const settings = await withPOSNetworkTimeout(getPOSSettings(branchId, { fresh: true }), 5000)
        if (cancelled) return
        known = true
        setEnabled(settings.block_duplicate_tabs === true)
        try { localStorage.setItem(cacheKey, JSON.stringify(settings.block_duplicate_tabs === true)) } catch { /* optional */ }
      } catch {
        if (cancelled || known) return
        // Retain the last confirmed policy during network interruptions.
        let saved = null
        try { saved = localStorage.getItem(cacheKey) } catch { /* optional */ }
        const config = saved === null ? await getCachedBranchConfig(branchId).catch(() => null) : null
        if (cancelled) return
        if (saved !== null || config?.settings) {
          known = true
          setEnabled(saved !== null ? saved === 'true' : config.settings.block_duplicate_tabs === true)
        } else setState('settings-error')
      } finally {
        checking = false
      }
    }
    const onStorage = event => { if (event.key === 'noch_pos_settings_changed') refresh() }
    refresh()
    const timer = setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('pos-settings-changed', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('pos-settings-changed', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [branchId, retry])

  useEffect(() => {
    if (enabled === null) return
    return watchPOSInstance(branchId, enabled, next => {
      setState(next)
      if (next === 'allowed') setEntered(true)
    })
  }, [branchId, enabled, retry])

  const allowed = state === 'allowed'
  return (
    <>
      {/* Keep an existing cart intact if the owner enables the restriction
          while this tab is open. A new blocked tab never mounts the terminal. */}
      {entered && <div hidden={!allowed} inert={!allowed}>{children}</div>}
      {!allowed && (
        <div className="min-h-screen bg-noch-dark flex items-center justify-center p-6">
          <section className="card max-w-md space-y-4 text-center" role="status">
            <h1 className="text-xl font-semibold text-white">
              {state === 'waiting' ? 'POS is already open' : state === 'loading' ? 'Checking POS access…' : 'POS access needs attention'}
            </h1>
            <p className="text-noch-muted text-sm">
              {state === 'waiting'
                ? 'Use the existing POS tab or window for this branch. This tab will become available automatically when it closes.'
                : state === 'unsupported'
                  ? 'This browser cannot enforce the duplicate-tab restriction. Open POS in an up-to-date browser over HTTPS, or ask the owner to turn the restriction off.'
                  : state === 'loading' ? 'Loading branch settings.'
                    : 'Could not verify POS access. Check your connection and try again.'}
            </p>
            {['error', 'settings-error'].includes(state) && (
              <button className="btn-primary" onClick={() => setRetry(value => value + 1)}>Try again</button>
            )}
            <Link className="block text-noch-green text-sm" to="/pos">Back to branches</Link>
          </section>
        </div>
      )}
    </>
  )
}
