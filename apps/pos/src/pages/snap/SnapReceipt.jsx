// SnapReceipt.jsx — Noch 5.0 Receipt Snap (PWA)
// Camera-first, photo-only expense submission for staff.
// Flow: open → camera → snap → AI reads → one tap picks branch (or split) → ✓ → camera again.
// Installable to the Android home screen (manifest: /snap-manifest.webmanifest).

import { useState, useRef, useEffect } from 'react'
import { Camera, Loader2, CheckCircle2, AlertTriangle, Scale, PenLine, RotateCcw, Banknote, CreditCard, Clock3 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// Downscale + JPEG-compress before upload (receipts don't need 12MP)
async function compressImage(file, maxDim = 1600, quality = 0.8) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return dataUrl.split(',')[1] // base64 only
}

async function callSnap(payload) {
  const { data, error } = await supabase.functions.invoke('expense-snap', { body: payload })
  if (error) {
    try {
      const body = await error.context?.clone().json()
      throw new Error(body?.error || body?.message || error.message)
    } catch (e) {
      if (e instanceof Error && e.message) throw e
      throw error
    }
  }
  return data
}

export default function SnapReceipt() {
  const { user } = useAuth()
  const fileRef = useRef(null)

  // phase: idle | reading | payment | pick | custom | saving | done | error
  const [phase, setPhase] = useState('idle')
  const [snap, setSnap] = useState(null)          // { snap_id, extracted, cost_centers, suggested_code }
  const [summary, setSummary] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [customText, setCustomText] = useState('')

  // The app already owns the root service worker. Swap only the manifest while
  // this route is mounted so Android installs Receipt Snap at /snap without
  // replacing the POS offline worker.
  useEffect(() => {
    const manifest = document.querySelector('link[rel="manifest"]')
    if (!manifest) return undefined
    const previous = manifest.getAttribute('href')
    manifest.setAttribute('href', '/snap-manifest.webmanifest')
    return () => manifest.setAttribute('href', previous || '/manifest.webmanifest')
  }, [])

  const reset = () => {
    setPhase('idle'); setSnap(null); setSummary(''); setErrorMsg(''); setCustomText('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhase('reading')
    try {
      const base64 = await compressImage(file)
      const res = await callSnap({
        action: 'extract',
        image_base64: base64,
        mime_type: 'image/jpeg',
        source: 'pwa',
        submitted_by: user.id,
      })
      if (!res?.snap_id) throw new Error(res?.error || 'extract failed')
      setSnap(res)
      setPhase('payment')
    } catch (err) {
      setErrorMsg(err.message || 'unknown')
      setPhase('error')
    }
  }

  const reportPayment = async (status, method = null) => {
    setPhase('saving')
    try {
      const res = await callSnap({
        action: 'set_payment',
        snap_id: snap.snap_id,
        status,
        method,
      })
      if (!res?.ok) throw new Error(res?.error || 'payment choice failed')
      setSnap(res)
      setPhase('pick')
    } catch (err) {
      setErrorMsg(err.message || 'unknown')
      setPhase('error')
    }
  }

  const finalize = async (allocation) => {
    setPhase('saving')
    try {
      const res = await callSnap({ action: 'finalize', snap_id: snap.snap_id, allocation })
      if (!res?.ok) throw new Error(res?.error || 'save failed')
      setSummary(res.summary)
      setPhase('done')
      setTimeout(reset, 2500) // back to camera for the next receipt in the stack
    } catch (err) {
      setErrorMsg(err.message || 'unknown')
      setPhase('error')
    }
  }

  const submitCustom = async () => {
    if (!customText.trim()) return
    setPhase('saving')
    try {
      const res = await callSnap({ action: 'custom_parse', snap_id: snap.snap_id, text: customText })
      if (!res?.ok) {
        setErrorMsg('ما فهمت التقسيم — اكتبه مثل: 300 سيتي ووك، 150 قالاريا')
        setPhase('custom')
        return
      }
      setSummary(res.summary)
      setPhase('done')
      setTimeout(reset, 2500)
    } catch (err) {
      setErrorMsg(err.message || 'unknown')
      setPhase('error')
    }
  }

  const ex = snap?.extracted || {}
  const ccs = snap?.cost_centers || []
  const suggested = snap?.suggested_code
  const orderedCCs = suggested
    ? [...ccs.filter(c => c.code === suggested), ...ccs.filter(c => c.code !== suggested)]
    : ccs

  return (
    <div dir="rtl" className="min-h-screen bg-noch-dark text-white flex flex-col items-center justify-center p-6 gap-6">
      <input
        ref={fileRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={onPhoto}
      />

      {phase === 'idle' && (
        <>
          <h1 className="text-2xl font-bold">📸 فاتورة نوش</h1>
          <p className="text-noch-muted text-center">صوّر الفاتورة وخلاص — النظام يقرأها بنفسه</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-48 h-48 rounded-full bg-noch-green text-noch-dark flex flex-col items-center justify-center gap-3 shadow-2xl active:scale-95 transition-transform"
          >
            <Camera size={64} />
            <span className="font-bold text-lg">صوّر</span>
          </button>
        </>
      )}

      {(phase === 'reading' || phase === 'saving') && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={56} className="animate-spin text-noch-green" />
          <p className="text-noch-muted">{phase === 'reading' ? 'جاري قراءة الفاتورة...' : 'جاري التسجيل...'}</p>
        </div>
      )}

      {phase === 'payment' && snap && (
        <div className="w-full max-w-sm flex flex-col gap-4">
          <div className="bg-white/5 rounded-2xl p-4 text-center">
            <p className="font-bold text-lg">{ex.vendor || 'فاتورة / Receipt'}</p>
            <p className="text-noch-green text-2xl font-bold">
              {ex.amount ? `${ex.amount} ${ex.currency || 'LYD'}` : 'المبلغ غير واضح / Amount unclear'}
            </p>
          </div>
          <div className="text-center">
            <p className="font-semibold">هل تم دفع هذا المصروف؟</p>
            <p className="text-sm text-noch-muted">Has this expense been paid?</p>
          </div>
          <button
            onClick={() => reportPayment('unpaid')}
            className="py-4 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 font-bold flex items-center justify-center gap-2 active:scale-95"
          >
            <Clock3 size={20} /> غير مدفوع / Unpaid
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => reportPayment('paid', 'cash')}
              className="py-4 rounded-xl bg-emerald-400/10 border border-emerald-400/30 text-emerald-300 font-bold flex items-center justify-center gap-2 active:scale-95"
            >
              <Banknote size={20} /> نقداً / Cash
            </button>
            <button
              onClick={() => reportPayment('paid', 'card')}
              className="py-4 rounded-xl bg-blue-400/10 border border-blue-400/30 text-blue-300 font-bold flex items-center justify-center gap-2 active:scale-95"
            >
              <CreditCard size={20} /> بطاقة / Card
            </button>
          </div>
        </div>
      )}

      {phase === 'pick' && snap && (
        <div className="w-full max-w-sm flex flex-col gap-4">
          <div className="bg-white/5 rounded-2xl p-4 text-center">
            <p className="font-bold text-lg">{ex.vendor || 'فاتورة'}</p>
            <p className="text-noch-green text-2xl font-bold">
              {ex.amount ? `${ex.amount} ${ex.currency || 'LYD'}` : 'المبلغ غير واضح'}
            </p>
            {!ex.amount && <p className="text-xs text-noch-muted">سيُراجع مكتبياً — كمّل عادي</p>}
          </div>
          <p className="text-center text-noch-muted">لأي فرع؟</p>
          <div className="flex flex-col gap-2">
            {orderedCCs.map(cc => (
              <button
                key={cc.code}
                onClick={() => finalize({ mode: 'single', code: cc.code })}
                className={`py-4 rounded-xl font-bold text-lg active:scale-95 transition-transform ${
                  cc.code === suggested ? 'bg-noch-green text-noch-dark' : 'bg-white/10'
                }`}
              >
                {cc.code === suggested ? '⭐ ' : ''}{cc.name}
              </button>
            ))}
            <div className="flex gap-2">
              <button
                onClick={() => finalize({ mode: 'even' })}
                className="flex-1 py-3 rounded-xl bg-white/10 flex items-center justify-center gap-2 active:scale-95"
              >
                <Scale size={18} /> تقسيم بالتساوي
              </button>
              <button
                onClick={() => { setErrorMsg(''); setPhase('custom') }}
                className="flex-1 py-3 rounded-xl bg-white/10 flex items-center justify-center gap-2 active:scale-95"
              >
                <PenLine size={18} /> تقسيم مخصص
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'custom' && (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <p className="text-center text-noch-muted">اكتب التقسيم — مثال: 300 سيتي ووك، 150 قالاريا</p>
          {errorMsg && <p className="text-yellow-400 text-sm text-center">{errorMsg}</p>}
          <input
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitCustom()}
            className="bg-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 ring-noch-green"
            placeholder="300 citywalk, 150 galaria"
            autoFocus
          />
          <button onClick={submitCustom} className="py-3 rounded-xl bg-noch-green text-noch-dark font-bold active:scale-95">
            تسجيل
          </button>
          <button onClick={() => setPhase('pick')} className="text-noch-muted text-sm">← رجوع</button>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 size={80} className="text-noch-green" />
          <p className="font-bold text-xl">تم التسجيل ✓</p>
          <p className="text-noch-muted text-center text-sm">{summary}</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col items-center gap-4">
          <AlertTriangle size={56} className="text-yellow-400" />
          <p className="text-center text-noch-muted max-w-xs break-words">{errorMsg}</p>
          <button onClick={reset} className="py-3 px-8 rounded-xl bg-noch-green text-noch-dark font-bold flex items-center gap-2 active:scale-95">
            <RotateCcw size={18} /> حاول مرة أخرى
          </button>
        </div>
      )}
    </div>
  )
}
