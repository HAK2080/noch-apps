// POSPinLogin.jsx — Staff picker + PIN confirmation screen before POS loads.
//
// Flow:
//   1. Load active staff who have a PIN set (from local cache instantly,
//      then refresh from Supabase in the background).
//   2. Staff taps their name/photo.
//   3. PIN keypad appears with their name shown.
//   4. PIN verified via verify_staff_pin RPC (online) OR local offline token.
//      → Offline verification uses a token stored after the last successful
//        online verification: sha256('offline_' + profileId + '_' + pin).
//        This means the first-ever login on a device requires internet; all
//        subsequent logins on the same device work offline.
//   5. On success: setServedBy(profile) and call onSuccess(profile).

import { useState, useEffect } from 'react'
import { Delete, Coffee, Loader2, ArrowLeft } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { setServedBy, setPinGrace, checkPinGrace } from '../lib/pos-session'
import { useAuth } from '../../../contexts/AuthContext'
import { isOnline } from '../lib/pos-offline'
import toast from 'react-hot-toast'

// ── Local SHA-256 (Web Crypto API) ─────────────────────────────────────────
async function sha256(str) {
  const data = new TextEncoder().encode(str)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Offline token helpers ──────────────────────────────────────────────────
// Key: noch_offline_pin_<profileId>
// Value: sha256('offline_' + profileId + '_' + pin)  (stored as hex)
function offlineKey(profileId) { return `noch_offline_pin_${profileId}` }

async function storeOfflineToken(profileId, pin) {
  try {
    const token = await sha256(`offline_${profileId}_${pin}`)
    localStorage.setItem(offlineKey(profileId), token)
  } catch { /* non-fatal */ }
}

async function verifyOfflineToken(profileId, pin) {
  try {
    const stored = localStorage.getItem(offlineKey(profileId))
    if (!stored) return false
    const test = await sha256(`offline_${profileId}_${pin}`)
    return test === stored
  } catch {
    return false
  }
}

// ── Staff list cache ───────────────────────────────────────────────────────
function staffCacheKey(branchId) { return `noch_staff_cache_${branchId || 'all'}` }

function loadCachedStaff(branchId) {
  try {
    const raw = localStorage.getItem(staffCacheKey(branchId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveCachedStaff(branchId, staffList) {
  try {
    localStorage.setItem(staffCacheKey(branchId), JSON.stringify(staffList))
  } catch { /* quota */ }
}

export default function POSPinLogin({ branchId, onSuccess, onSkip }) {
  const { isOwner } = useAuth()

  // Step: 'grid' | 'pin'
  const [step, setStep] = useState('grid')
  const [staffList, setStaffList] = useState(() => loadCachedStaff(branchId))
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [selectedStaff, setSelectedStaff] = useState(null)

  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  // Load staff: show cache immediately, then refresh from DB in background
  useEffect(() => {
    const cached = loadCachedStaff(branchId)
    if (cached.length > 0) {
      setStaffList(cached)
      setLoadingStaff(false)
    }

    if (!isOnline()) {
      setLoadingStaff(false)
      return
    }

    const load = async () => {
      try {
        let query = supabase
          .from('profiles')
          .select('id, full_name, role, photo_url, department')
          .eq('is_active', true)
          .not('pin_code', 'is', null)
          .order('full_name')

        if (branchId) {
          query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
        }

        const { data, error } = await query
        if (error) throw error
        const list = data || []
        setStaffList(list)
        saveCachedStaff(branchId, list)
      } catch (err) {
        console.error('Failed to load staff:', err)
        // Keep cached list if fetch fails
      } finally {
        setLoadingStaff(false)
      }
    }
    load()
  }, [branchId])

  const handleSelectStaff = (staff) => {
    // Grace-period fast path: same staff within 30 min → skip PIN entry.
    if (checkPinGrace(staff.id)) {
      toast.success(`Welcome back, ${staff.full_name || 'Staff'} 👋`)
      setServedBy(staff)
      onSuccess(staff)
      return
    }
    setSelectedStaff(staff)
    setPin('')
    setError('')
    setStep('pin')
  }

  const handleBack = () => {
    setStep('grid')
    setSelectedStaff(null)
    setPin('')
    setError('')
  }

  const handleVerify = async () => {
    if (pin.length < 4) { setError('PIN must be 4-6 digits'); return }
    await verifyPin(pin)
  }

  const verifyPin = async (pinToVerify) => {
    setVerifying(true)
    setError('')
    try {
      let profile = null

      if (isOnline()) {
        // ── Online: verify via RPC ──────────────────────────────────────
        const { data, error: rpcErr } = await supabase.rpc('verify_staff_pin', {
          p_profile_id: selectedStaff.id,
          p_pin: pinToVerify,
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

        profile = data.profile
        // Cache an offline token so this staff can verify next time without internet
        await storeOfflineToken(selectedStaff.id, pinToVerify)
        // Start the 30-min grace period so a quick return skips PIN re-entry
        setPinGrace(selectedStaff.id)

      } else {
        // ── Offline: verify via local token ────────────────────────────
        const ok = await verifyOfflineToken(selectedStaff.id, pinToVerify)
        if (!ok) {
          setError('Incorrect PIN — or connect to internet for first-time login')
          setPin('')
          return
        }
        // Build profile from cached staff list
        profile = {
          id:         selectedStaff.id,
          full_name:  selectedStaff.full_name,
          role:       selectedStaff.role,
          photo_url:  selectedStaff.photo_url,
          department: selectedStaff.department,
        }
        setPinGrace(selectedStaff.id)
        toast('Signed in offline', { icon: '📴' })
      }

      toast.success(`Welcome, ${profile.full_name || 'Staff'} 👋`)
      setServedBy(profile)
      onSuccess(profile)
    } catch (err) {
      setError(err.message || 'Verification failed')
      setPin('')
    } finally {
      setVerifying(false)
    }
  }

  const handleDigit = async (d) => {
    if (pin.length >= 6 || verifying) return
    const newPin = pin + d
    setPin(newPin)
    setError('')
    if (newPin.length === 6) {
      await verifyPin(newPin)
    }
  }

  const removeDigit = () => {
    if (!verifying) setPin(prev => prev.slice(0, -1))
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  // ── GRID STEP ──────────────────────────────────────────────────────────────
  if (step === 'grid') {
    return (
      <div className="flex items-start justify-center py-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-noch-green/10 border border-noch-green/20 flex items-center justify-center mx-auto mb-4">
              <Coffee size={28} className="text-noch-green" />
            </div>
            <h1 className="text-white font-bold text-2xl">Who's serving?</h1>
            <p className="text-noch-muted text-sm mt-1">
              {!isOnline() ? '📴 Offline — using cached staff' : 'Select your name then enter your PIN'}
            </p>
          </div>

          {loadingStaff && staffList.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 size={32} className="animate-spin text-noch-green" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-noch-muted text-sm">No staff with PIN configured.</p>
              <p className="text-noch-muted text-xs mt-2">Staff must log in and set a PIN in My Profile first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {staffList.map(staff => (
                <button
                  key={staff.id}
                  onClick={() => handleSelectStaff(staff)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-noch-card border border-noch-border hover:border-noch-green/50 hover:bg-noch-green/5 transition-all"
                >
                  {/* Avatar */}
                  <div className="w-14 h-14 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {staff.photo_url ? (
                      <img src={staff.photo_url} alt={staff.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-zinc-400">
                        {staff.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <span className="text-white text-xs font-medium text-center leading-tight line-clamp-2">
                    {staff.full_name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Owner skip */}
          {onSkip && isOwner && (
            <button
              onClick={() => { setServedBy(null); onSkip() }}
              className="w-full mt-6 py-2 text-noch-muted text-sm hover:text-white transition-colors"
            >
              Skip (Owner Mode)
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── PIN STEP ───────────────────────────────────────────────────────────────
  return (
    <div className="flex items-start justify-center py-8">
      <div className="w-full max-w-xs">
        {/* Back + selected staff */}
        <div className="text-center mb-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-noch-muted hover:text-white text-sm mx-auto mb-4 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>

          {/* Staff avatar */}
          <div className="w-16 h-16 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center mx-auto mb-3">
            {selectedStaff?.photo_url ? (
              <img src={selectedStaff.photo_url} alt={selectedStaff.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-zinc-400">
                {selectedStaff?.full_name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            )}
          </div>
          <h2 className="text-white font-bold text-lg">{selectedStaff?.full_name}</h2>
          <p className="text-noch-muted text-sm mt-1">Enter your PIN</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-6">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
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
              <button key={i} onClick={removeDigit} disabled={verifying}
                className="aspect-square rounded-2xl bg-noch-card border border-noch-border text-noch-muted hover:text-white hover:border-noch-border/80 transition-colors flex items-center justify-center disabled:opacity-50">
                <Delete size={18} />
              </button>
            )
            return (
              <button key={i} onClick={() => handleDigit(k)} disabled={verifying}
                className="aspect-square rounded-2xl bg-noch-card border border-noch-border text-white font-bold text-xl hover:bg-noch-border transition-colors disabled:opacity-50 flex items-center justify-center">
                {k}
              </button>
            )
          })}
        </div>

        {/* Enter button */}
        <button
          onClick={handleVerify}
          disabled={pin.length < 4 || verifying}
          className="w-full py-3.5 rounded-2xl bg-noch-green text-noch-dark font-bold text-sm hover:bg-noch-green/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {verifying ? <Loader2 size={16} className="animate-spin" /> : null}
          {verifying ? 'Verifying...' : 'Enter'}
        </button>
      </div>
    </div>
  )
}
