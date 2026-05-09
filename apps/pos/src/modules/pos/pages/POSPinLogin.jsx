// POSPinLogin.jsx — PIN entry screen before POS terminal loads
// Shows a 4-6 digit numpad. On success, passes staff profile to parent.

import { useState } from 'react'
import { Delete, Coffee, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { setServedBy } from '../lib/pos-session'
import { useAuth } from '../../../contexts/AuthContext'
import toast from 'react-hot-toast'

// Verification routes through the verify_pos_pin RPC, which:
//   * uses each user's per-user salt (with a legacy fallback for existing
//     PINs that were hashed with the old static salt 'noch_salt_2026'),
//   * rate-limits brute force (10 failed attempts / 5 min → 15 min lock),
//   * never returns the stored hash to the client.
// The client never hashes PINs anymore.

export default function POSPinLogin({ branchId, onSuccess, onSkip }) {
  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const { isOwner } = useAuth()

  const addDigit = (d) => {
    if (pin.length >= 6) return
    setPin(prev => prev + d)
    setError('')
  }

  const removeDigit = () => setPin(prev => prev.slice(0, -1))

  const handleVerify = async () => {
    if (pin.length < 4) { setError('PIN must be 4-6 digits'); return }
    setVerifying(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('verify_pos_pin', {
        p_pin: pin,
        p_branch_id: branchId || null,
      })
      if (rpcErr) throw rpcErr
      if (data?.locked) {
        setError(`Too many failed attempts. Try again in ${Math.ceil((data.retry_in_seconds || 900) / 60)} min.`)
        setPin('')
        return
      }
      if (!data?.matched) {
        setError('Incorrect PIN — try again')
        setPin('')
        return
      }
      toast.success(`Welcome, ${data.profile.full_name || 'Staff'} 👋`)
      setServedBy(data.profile)
      onSuccess(data.profile)
    } catch (err) {
      setError(err.message || 'Verification failed')
      setPin('')
    } finally {
      setVerifying(false)
    }
  }

  // Auto-verify when 6 digits entered. Routes through the same RPC.
  const handleDigit = async (d) => {
    const newPin = pin + d
    if (newPin.length > 6) return
    setPin(newPin)
    setError('')
    if (newPin.length === 6) {
      setVerifying(true)
      try {
        const { data } = await supabase.rpc('verify_pos_pin', {
          p_pin: newPin, p_branch_id: branchId || null,
        })
        if (data?.locked) {
          setError(`Too many failed attempts. Try again in ${Math.ceil((data.retry_in_seconds || 900) / 60)} min.`)
          setPin('')
        } else if (data?.matched) {
          toast.success(`Welcome, ${data.profile.full_name || 'Staff'} 👋`)
          setServedBy(data.profile)
          onSuccess(data.profile)
        } else {
          setError('Incorrect PIN')
          setPin('')
        }
      } catch {
        setError('Verification failed')
        setPin('')
      } finally {
        setVerifying(false)
      }
    }
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center p-4">
      <div className="w-full max-w-xs">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-noch-green/10 border border-noch-green/20 flex items-center justify-center mx-auto mb-4">
            <Coffee size={28} className="text-noch-green" />
          </div>
          <h1 className="text-white font-bold text-2xl">noch.apps</h1>
          <p className="text-noch-muted text-sm mt-1">Enter your PIN to continue</p>
        </div>

        {/* PIN display */}
        <div className="flex justify-center gap-3 mb-6">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${
              i < pin.length
                ? 'bg-noch-green border-noch-green'
                : 'bg-transparent border-noch-border'
            }`} />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="text-red-400 text-sm text-center mb-4 bg-red-500/10 rounded-lg p-2">{error}</div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {KEYS.map((k, i) => {
            if (k === '') return <div key={i} />
            if (k === '⌫') return (
              <button key={i} onClick={removeDigit} className="aspect-square rounded-2xl bg-noch-card border border-noch-border text-noch-muted hover:text-white hover:border-noch-border/80 transition-colors flex items-center justify-center">
                <Delete size={18} />
              </button>
            )
            return (
              <button
                key={i}
                onClick={() => handleDigit(k)}
                disabled={verifying}
                className="aspect-square rounded-2xl bg-noch-card border border-noch-border text-white font-bold text-xl hover:bg-noch-border transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {k}
              </button>
            )
          })}
        </div>

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={pin.length < 4 || verifying}
          className="w-full py-3.5 rounded-2xl bg-noch-green text-noch-dark font-bold text-sm hover:bg-noch-green/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {verifying ? <Loader2 size={16} className="animate-spin" /> : null}
          {verifying ? 'Verifying...' : 'Enter'}
        </button>

        {/* Skip (owner bypass) — gated to actual owner profile only. */}
        {onSkip && isOwner && (
          <button
            onClick={() => { setServedBy(null); onSkip() }}
            className="w-full mt-3 py-2 text-noch-muted text-sm hover:text-white transition-colors"
          >
            Skip (Owner Mode)
          </button>
        )}
      </div>
    </div>
  )
}
