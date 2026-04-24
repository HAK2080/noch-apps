// POSPinLogin.jsx — PIN entry screen before POS terminal loads
// Shows a 4-6 digit numpad. On success, passes staff profile to parent.

import { useState } from 'react'
import { Delete, Coffee, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

// Simple hash for PIN verification — matches what's stored in profiles.pin_code
// We use a simple btoa approach (not truly secure but functional for café context)
async function hashPin(pin) {
  // Use Web Crypto API for SHA-256
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + 'noch_salt_2026')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function POSPinLogin({ branchId, onSuccess, onSkip }) {
  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

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
      const hashed = await hashPin(pin)
      // Find staff with matching PIN for this branch (or any branch)
      const { data, error: dbErr } = await supabase
        .from('profiles')
        .select('id, full_name, role, app_role_id, photo_url, department')
        .eq('pin_code', hashed)
        .eq('is_active', true)
        .limit(1)
      if (dbErr) throw dbErr
      if (!data?.length) {
        setError('Incorrect PIN — try again')
        setPin('')
        return
      }
      toast.success(`Welcome, ${data[0].full_name || 'Staff'} 👋`)
      onSuccess(data[0])
    } catch (err) {
      setError('Verification failed')
      setPin('')
    } finally {
      setVerifying(false)
    }
  }

  // Auto-verify when 6 digits entered
  const handleDigit = async (d) => {
    const newPin = pin + d
    if (newPin.length > 6) return
    setPin(newPin)
    setError('')
    if (newPin.length >= 4) {
      // Wait a tick then auto-try if it's 6 digits
      if (newPin.length === 6) {
        setVerifying(true)
        setTimeout(async () => {
          const hashed = await hashPin(newPin)
          const { data } = await supabase.from('profiles').select('id, full_name, role, app_role_id, photo_url').eq('pin_code', hashed).eq('is_active', true).limit(1)
          setVerifying(false)
          if (data?.length) {
            toast.success(`Welcome, ${data[0].full_name || 'Staff'} 👋`)
            onSuccess(data[0])
          } else {
            setError('Incorrect PIN')
            setPin('')
          }
        }, 200)
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
          <h1 className="text-white font-bold text-2xl">noch omni</h1>
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

        {/* Skip (owner bypass) */}
        {onSkip && (
          <button onClick={onSkip} className="w-full mt-3 py-2 text-noch-muted text-sm hover:text-white transition-colors">
            Skip (Owner Mode)
          </button>
        )}
      </div>
    </div>
  )
}
