import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { getGlobalStockPolicy, setGlobalStockPolicy } from '../lib/global-stock'

export default function GlobalStockControl() {
  const { isOwner } = useAuth()
  const [enabled, setEnabled] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isOwner) return
    getGlobalStockPolicy().then(setEnabled).catch(err => setError(err.message))
  }, [isOwner])
  if (!isOwner) return null
  async function toggle() {
    setSaving(true); setError('')
    try { await setGlobalStockPolicy(!enabled); setEnabled(!enabled) }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }
  return <section className="rounded-xl border border-noch-border bg-noch-card p-4">
    <div className="flex items-center justify-between gap-4">
      <div><h2 className="text-white text-sm font-semibold">Block sales without stock — all branches</h2>
        <p className="text-xs text-noch-muted mt-1">When on, block zero, negative or insufficient stock and products without stock setup. Blocked images are shaded. Checkout checks stock online.</p></div>
      <button role="switch" aria-label="Block sales without stock — all branches" aria-checked={enabled === true} disabled={enabled == null || saving} onClick={toggle}
        className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${enabled ? 'bg-noch-green text-noch-dark' : 'bg-noch-border text-white'}`}>
        {saving ? 'Saving…' : enabled == null ? 'Loading…' : enabled ? 'On' : 'Off'}
      </button>
    </div>
    {error && <p role="alert" className="text-red-400 text-xs mt-2">{error}</p>}
  </section>
}
