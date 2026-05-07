// ManagerOverrideModal.jsx — PIN re-prompt for manager-only actions.
// Routes through verify_manager_pin RPC (owner or manager role required).
// Used by: discount > cap, void, partial refund.

import { useState } from 'react'
import { Shield, X, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function ManagerOverrideModal({ action, onApprove, onClose }) {
  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (pin.length < 4) { setError('Manager PIN required'); return }
    setVerifying(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('verify_manager_pin', { p_pin: pin })
      if (rpcErr) throw rpcErr
      if (data?.locked) {
        setError(`Too many failed attempts. Try in ${Math.ceil((data.retry_in_seconds || 900) / 60)} min.`)
        setPin('')
        return
      }
      if (!data?.matched) {
        setError(data?.reason === 'not_a_manager' ? 'Not a manager PIN' : 'Incorrect PIN')
        setPin('')
        return
      }
      onApprove(data.profile)
    } catch (err) {
      setError(err.message || 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-xs p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-yellow-400" />
            <h2 className="text-white font-semibold">Manager approval</h2>
          </div>
          <button onClick={onClose} className="text-noch-muted hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="text-noch-muted text-xs mb-4">{action || 'Enter a manager PIN to authorise this action.'}</p>
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          autoFocus
          value={pin}
          onChange={e => { setPin(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Manager PIN"
          className="input w-full text-center text-lg tracking-widest mb-3"
          maxLength={6}
        />
        {error && <p className="text-red-400 text-sm mb-2 text-center">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={verifying || pin.length < 4}
          className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
        >
          {verifying ? <Loader2 size={14} className="animate-spin" /> : null}
          {verifying ? 'Checking…' : 'Approve'}
        </button>
      </div>
    </div>
  )
}
