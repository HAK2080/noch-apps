// Passport.jsx — public customer Passport (Phase 2)
// Route: /passport/:token  (HashRouter)

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STAMP_GOAL = 9

const NOCHI_LABEL_AR = {
  happy: 'سعيد', sad: 'حزين', tired: 'تعبان', deathbed: 'على الفراش', dead: 'نائم',
}
const TIER_LABEL_AR = {
  bronze: 'برونزي', silver: 'فضي', gold: 'ذهبي', legend: 'أسطوري',
}

const MILK_OPTIONS = [
  { value: '', ar: '—', en: '—' },
  { value: 'whole',        ar: 'كامل الدسم',  en: 'Whole' },
  { value: 'skim',         ar: 'خالي الدسم',  en: 'Skim' },
  { value: 'oat',          ar: 'شوفان',       en: 'Oat' },
  { value: 'almond',       ar: 'لوز',         en: 'Almond' },
  { value: 'soy',          ar: 'صويا',        en: 'Soy' },
  { value: 'lactose_free', ar: 'خالي اللاكتوز', en: 'Lactose-free' },
]

const SWEETNESS_OPTIONS = [
  { value: '', ar: '—', en: '—' },
  { value: 'no_sugar', ar: 'بدون سكر', en: 'No sugar' },
  { value: 'less',     ar: 'قليل',     en: 'Less' },
  { value: 'normal',   ar: 'عادي',     en: 'Normal' },
  { value: 'extra',    ar: 'زيادة',    en: 'Extra' },
]

function iconForState(state) {
  switch (state) {
    case 'happy': return '🐰'
    case 'sad': return '😔'
    case 'tired': return '😴'
    case 'deathbed': return '🤒'
    case 'dead': return '💤'
    default: return '🐰'
  }
}

function labelFor(options, value, ar) {
  const o = options.find(x => x.value === value)
  if (!o) return value
  return ar ? o.ar : o.en
}

export default function Passport({ lang = 'ar' }) {
  // Default to Arabic — the receipt audience is Tripoli walk-ins.
  const isAr = lang !== 'en'
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEdit, setShowEdit] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await supabase.rpc('get_public_passport', { p_token: token })
      if (err) throw err
      if (!data) setError('not_found')
      else setData(data)
    } catch (e) {
      setError(e.message || 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  if (loading) {
    return (
      <div className="menu-page rtl" dir="rtl">
        <div className="card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>…</div>
      </div>
    )
  }

  if (error === 'not_found' || !data) {
    return (
      <div className="menu-page rtl" dir="rtl">
        <nav className="nav">
          <Link to="/" className="back">→ الرئيسية</Link>
        </nav>
        <div className="card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
          <h1 style={{ marginBottom: 12 }}>Nochi Passport</h1>
          <p>هذه البطاقة غير موجودة. اطلب من الموظف بطاقتك.</p>
          <p style={{ opacity: 0.6, fontSize: 13, marginTop: 8 }}>This Passport doesn’t exist. Ask staff at the counter.</p>
        </div>
      </div>
    )
  }

  const cycleProgress = Math.min(STAMP_GOAL, data.current_stamps || 0)
  const stampsLeft = Math.max(0, STAMP_GOAL - cycleProgress)
  const cycleStamps = Array.from({ length: STAMP_GOAL }, (_, i) => i < cycleProgress)
  const pendingRewards = Array.isArray(data.pending_rewards) ? data.pending_rewards : []

  return (
    <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <nav className="nav">
        <Link to="/" className="back">{isAr ? '→ الرئيسية' : '← Home'}</Link>
        <Link to="/" className="logo-sm">
          <img src="/assets/logo.svg" alt="Noch" style={{ height: 32 }} />
        </Link>
        <div />
      </nav>

      <div className="card" style={{ maxWidth: 520, margin: '24px auto', padding: 20 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 4 }}>{iconForState(data.nochi_state)}</div>
          <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>
            {isAr ? (NOCHI_LABEL_AR[data.nochi_state] || data.nochi_state) : data.nochi_state}
          </p>
          <h1 style={{ margin: '6px 0 2px' }}>{data.full_name}</h1>
          <p style={{ opacity: 0.7, fontSize: 14, margin: 0 }}>
            {isAr
              ? `${TIER_LABEL_AR[data.tier] || data.tier} · ${data.total_visits || 0} زيارة`
              : `${data.tier} · ${data.total_visits || 0} visits`}
          </p>
        </div>

        {/* Stamps */}
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{isAr ? 'الأختام' : 'Stamps'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 6 }}>
            {cycleStamps.map((filled, i) => (
              <div
                key={i}
                style={{
                  aspectRatio: '1 / 1',
                  borderRadius: '50%',
                  border: '2px solid currentColor',
                  background: filled ? 'currentColor' : 'transparent',
                  opacity: filled ? 1 : 0.25,
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: 13, marginTop: 8, opacity: 0.8 }}>
            {stampsLeft === 0
              ? (isAr ? '🎉 لديك مشروب مجاني — اطلبه من الموظف.' : "🎉 You've got a free drink — ask the barista.")
              : (isAr ? `${stampsLeft} ختم لمشروب مجاني` : `${stampsLeft} stamp${stampsLeft === 1 ? '' : 's'} until your next free drink`)
            }
          </p>
        </section>

        {/* Pending rewards */}
        {pendingRewards.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>{isAr ? 'جوائز قابلة للاستلام' : 'Rewards waiting'}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {pendingRewards.map(r => (
                <li key={r.id} style={{ padding: '6px 0', fontSize: 14 }}>
                  🎁 {r.description || (isAr ? 'مشروب مجاني' : 'Free drink')}
                  {r.expires_at && (
                    <span style={{ opacity: 0.6, marginLeft: 6 }}>
                      {isAr ? '· ينتهي ' : '· expires '}
                      {new Date(r.expires_at).toLocaleDateString(isAr ? 'ar-LY' : 'en-GB')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Your usual */}
        {(data.favorite_drink || data.milk_preference || data.sweetness_preference) && (
          <section style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>{isAr ? 'المعتاد' : 'Your usual'}</h2>
            <p style={{ fontSize: 15, margin: 0 }}>
              {data.favorite_drink || '—'}
              {data.milk_preference && (
                <span style={{ opacity: 0.7, marginLeft: 8 }}> · {labelFor(MILK_OPTIONS, data.milk_preference, isAr)}</span>
              )}
              {data.sweetness_preference && (
                <span style={{ opacity: 0.7, marginLeft: 8 }}> · {labelFor(SWEETNESS_OPTIONS, data.sweetness_preference, isAr)}</span>
              )}
            </p>
          </section>
        )}

        {/* Show this to staff */}
        <div style={{ marginTop: 16, padding: 10, border: '1px dashed currentColor', borderRadius: 8, textAlign: 'center', opacity: 0.85 }}>
          <p style={{ margin: 0, fontSize: 14 }}>{isAr ? 'أظهر هذه الصفحة للموظف عند الطلب' : 'Show this page to staff at the counter'}</p>
        </div>

        {/* Edit */}
        <div style={{ marginTop: 16 }}>
          {showEdit ? (
            <EditPanel
              token={token}
              initial={data}
              isAr={isAr}
              onSaved={async () => { setShowEdit(false); await load() }}
              onCancel={() => setShowEdit(false)}
            />
          ) : (
            <button className="btn" onClick={() => setShowEdit(true)}>
              {isAr ? 'تعديل تفضيلاتي' : 'Edit my preferences'}
            </button>
          )}
        </div>

        <p style={{ marginTop: 16, fontSize: 12, opacity: 0.55 }}>
          {isAr
            ? 'خصوصية: لا نعرض رقم هاتفك على هذه الصفحة. التعديلات تتطلب آخر 4 أرقام من رقمك.'
            : "Privacy: your phone number isn't shown here. Edits require the last 4 digits of your phone."}
        </p>
      </div>
    </div>
  )
}

function EditPanel({ token, initial, isAr, onSaved, onCancel }) {
  const [last4, setLast4] = useState('')
  const [favoriteDrink, setFavoriteDrink] = useState(initial.favorite_drink || '')
  const [milk, setMilk] = useState(initial.milk_preference || '')
  const [sweet, setSweet] = useState(initial.sweetness_preference || '')
  const [ig, setIg] = useState(initial.instagram_handle || '')
  const [tt, setTt] = useState(initial.tiktok_handle || '')
  const [waOptIn, setWaOptIn] = useState(!!initial.whatsapp_opt_in)
  const [ugc, setUgc] = useState(!!initial.ugc_consent)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    if (!/^\d{4}$/.test(last4)) {
      setErr(isAr ? 'بنحتاج آخر 4 أرقام من هاتفك للتحقق.' : "Enter the last 4 digits of your phone to verify.")
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('update_passport_preferences', {
        p_token: token,
        p_phone_last4: last4,
        p_updates: {
          favorite_drink: favoriteDrink,
          milk_preference: milk,
          sweetness_preference: sweet,
          instagram_handle: ig.replace(/^@/, ''),
          tiktok_handle: tt.replace(/^@/, ''),
          whatsapp_opt_in: waOptIn,
          ugc_consent: ugc,
        },
      })
      if (error) throw error
      if (!data?.ok) {
        if (data?.error === 'verify_failed') setErr(isAr ? 'آخر 4 أرقام غير مطابقة. اطلب من الموظف.' : "Last 4 don't match — ask staff.")
        else if (data?.error === 'not_found') setErr(isAr ? 'البطاقة غير موجودة.' : 'Passport not found.')
        else setErr(isAr ? 'تعذر الحفظ.' : "Couldn't save.")
        return
      }
      await onSaved()
    } catch (e) {
      setErr(e.message || (isAr ? 'تعذر الحفظ.' : "Couldn't save."))
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }
  const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', font: 'inherit' }

  return (
    <form onSubmit={submit}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{isAr ? 'تحديث تفضيلاتي' : 'Update my preferences'}</h2>

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>{isAr ? 'آخر 4 أرقام من هاتفي' : 'Last 4 digits of my phone'}</span>
        <input
          style={inputStyle}
          inputMode="numeric"
          maxLength={4}
          value={last4}
          onChange={e => setLast4(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder="••••"
          required
          autoFocus
        />
      </label>

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>{isAr ? 'مشروبي المفضل' : 'Favourite drink'}</span>
        <input
          style={inputStyle}
          value={favoriteDrink}
          onChange={e => setFavoriteDrink(e.target.value)}
          placeholder={isAr ? 'مثل: لاتيه إسباني' : 'e.g. Spanish Latte'}
        />
      </label>

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>{isAr ? 'الحليب' : 'Milk'}</span>
        <select style={inputStyle} value={milk} onChange={e => setMilk(e.target.value)}>
          {MILK_OPTIONS.map(o => <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>)}
        </select>
      </label>

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>{isAr ? 'السكر' : 'Sweetness'}</span>
        <select style={inputStyle} value={sweet} onChange={e => setSweet(e.target.value)}>
          {SWEETNESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>)}
        </select>
      </label>

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>Instagram</span>
        <input style={inputStyle} value={ig} onChange={e => setIg(e.target.value)} placeholder="@yourhandle" dir="ltr" />
      </label>

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>TikTok</span>
        <input style={inputStyle} value={tt} onChange={e => setTt(e.target.value)} placeholder="@yourhandle" dir="ltr" />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input type="checkbox" checked={waOptIn} onChange={e => setWaOptIn(e.target.checked)} />
        <span style={{ fontSize: 14 }}>{isAr ? 'أوافق على استلام تنبيهات على واتساب' : "Send me WhatsApp updates"}</span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" checked={ugc} onChange={e => setUgc(e.target.checked)} />
        <span style={{ fontSize: 14 }}>{isAr ? 'أوافق على إعادة نشر صوري إذا قمت بوسمكم' : "Repost my photos if I tag you"}</span>
      </label>

      {err && <p style={{ color: '#e63946', fontSize: 13, marginBottom: 8 }}>{err}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn ghost" onClick={onCancel} style={{ flex: 1 }}>
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
        <button type="submit" className="btn" disabled={saving} style={{ flex: 1 }}>
          {saving ? (isAr ? 'جاري الحفظ…' : 'Saving…') : (isAr ? 'حفظ' : 'Save')}
        </button>
      </div>
    </form>
  )
}
