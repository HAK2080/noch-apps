import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export default function CustomerMemoryDrawer({ customerId, fallback }) {
  const [data, setData] = useState(fallback || null)
  const [memory, setMemory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [rowRes, memRes] = await Promise.all([
          supabase
            .from('loyalty_customers')
            .select(`
              id, full_name, phone, tier, current_stamps, total_visits, nochi_state,
              birthday_day, birthday_month,
              favorite_drink, favorite_drinks, favorite_other,
              milk_preference, sweetness_preference,
              instagram_handle, tiktok_handle, facebook_handle,
              whatsapp_opt_in, whatsapp_opt_in_at,
              ugc_consent, ugc_consent_at,
              consent_source
            `)
            .eq('id', customerId)
            .maybeSingle(),
          supabase.rpc('get_customer_memory', { p_customer_id: customerId }),
        ])
        if (cancelled) return
        if (!rowRes.error && rowRes.data) setData(rowRes.data)
        if (!memRes.error) {
          // RPC returns the row shape directly
          setMemory(Array.isArray(memRes.data) ? memRes.data[0] : memRes.data)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [customerId])

  const copyGreeting = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard access is optional */ }
  }

  if (!data) {
    return (
      <div className="mt-2 bg-noch-card border border-noch-border rounded-xl p-3 text-xs text-noch-muted">
        {loading ? 'Loading…' : 'No memory yet.'}
      </div>
    )
  }

  const drinks = Array.isArray(data.favorite_drinks) && data.favorite_drinks.length > 0
    ? data.favorite_drinks
    : (data.favorite_drink ? [data.favorite_drink] : [])
  const handleLine = ['instagram_handle', 'tiktok_handle', 'facebook_handle']
    .map(k => data[k] ? { k, v: data[k] } : null)
    .filter(Boolean)
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB') : null
  const consentTip = (when, source) =>
    [fmtDate(when), source].filter(Boolean).join(' · ')

  return (
    <div className="mt-2 bg-noch-card border border-noch-border rounded-xl p-3 text-xs space-y-1.5">
      {/* Phase 8 — memory summary + suggested greeting (AI-helper, never auto-sent) */}
      {memory?.summary_en && (
        <div className="bg-noch-dark/40 border border-noch-border/50 rounded-lg p-2.5 space-y-1.5">
          <p className="text-white/90 leading-snug">{memory.summary_en}</p>
          {memory.greeting_en && (
            <button
              type="button"
              onClick={() => copyGreeting(memory.greeting_en)}
              className="w-full text-left text-noch-green hover:text-noch-green/80 italic flex items-start gap-1.5 transition-colors"
              title="Copy suggested greeting"
            >
              <span className="opacity-60 not-italic shrink-0">💬</span>
              <span className="flex-1">"{memory.greeting_en}"</span>
              <span className="opacity-60 not-italic text-[10px] shrink-0">{copied ? '✓' : '⧉'}</span>
            </button>
          )}
        </div>
      )}

      {drinks.length > 0 && (
        <p className="text-noch-muted">
          <span className="text-white font-medium">☕ </span>
          {drinks.join(' · ')}
          {data.milk_preference && <span> · milk: {data.milk_preference}</span>}
          {data.sweetness_preference && <span> · sweet: {data.sweetness_preference}</span>}
        </p>
      )}

      {data.favorite_other && (
        <p className="text-noch-muted">
          <span className="text-white font-medium">🥐 </span>
          {data.favorite_other}
        </p>
      )}

      {data.birthday_day && data.birthday_month && (
        <p className="text-noch-muted">
          <span className="text-white font-medium">🎂 </span>
          {data.birthday_day}/{data.birthday_month}
        </p>
      )}

      {handleLine.length > 0 && (
        <p className="text-noch-muted flex flex-wrap gap-x-2 gap-y-0.5">
          {data.instagram_handle && <span><span className="text-white font-medium">IG:</span> @{data.instagram_handle}</span>}
          {data.tiktok_handle    && <span><span className="text-white font-medium">TT:</span> @{data.tiktok_handle}</span>}
          {data.facebook_handle  && <span><span className="text-white font-medium">FB:</span> {data.facebook_handle}</span>}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            data.whatsapp_opt_in
              ? 'bg-noch-green/15 text-noch-green border border-noch-green/30'
              : 'bg-noch-border/30 text-noch-muted border border-noch-border'
          }`}
          title={consentTip(data.whatsapp_opt_in_at, data.consent_source)}
        >
          WhatsApp: {data.whatsapp_opt_in ? 'yes' : 'no'}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            data.ugc_consent
              ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
              : 'bg-noch-border/30 text-noch-muted border border-noch-border'
          }`}
          title={consentTip(data.ugc_consent_at, data.consent_source)}
        >
          UGC consent: {data.ugc_consent ? 'yes' : 'no'}
        </span>
      </div>
    </div>
  )
}
