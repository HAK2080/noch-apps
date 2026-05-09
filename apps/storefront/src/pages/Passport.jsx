// Passport.jsx — public Nochi Pass page (Phase 2)
// Route: /passport/:token  (HashRouter)

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STAMP_GOAL = 9

const NOCHI_LABEL_AR = {
  happy: 'سعيد', sad: 'حزين', tired: 'تعبان', deathbed: 'على الفراش', dead: 'نائم',
}
const TIER_LABEL_AR = {
  bronze: 'برونزي', silver: 'فضي', gold: 'ذهبي', legend: 'أسطوري',
}

const NOCHI_IMG = {
  happy: '/assets/nochi/nochi-happy.png',
  sad: '/assets/nochi/nochi-sad.png',
  tired: '/assets/nochi/nochi-tired.png',
  deathbed: '/assets/nochi/nochi-deathbed.png',
  dead: '/assets/nochi/nochi-dead.png',
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

const OTHER_DRINK = '__other__'

function labelFor(options, value, ar) {
  const o = options.find(x => x.value === value)
  if (!o) return value
  return ar ? o.ar : o.en
}

export default function Passport() {
  // Per-tab language toggle. Default to AR (the receipt audience).
  const [lang, setLang] = useState(() => localStorage.getItem('noch_pass_lang') || 'ar')
  useEffect(() => { localStorage.setItem('noch_pass_lang', lang) }, [lang])
  const isAr = lang === 'ar'

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

  const LangToggle = (
    <button
      onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
      className="btn ghost"
      style={{ padding: '4px 10px', fontSize: 13, fontWeight: 600, border: '1.5px solid currentColor' }}
      aria-label="Switch language"
    >
      {lang === 'ar' ? 'EN' : 'عربي'}
    </button>
  )

  if (loading) {
    return (
      <div className="menu-page rtl" dir="rtl">
        <div className="card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>…</div>
      </div>
    )
  }

  if (error === 'not_found' || !data) {
    return (
      <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
        <nav className="nav">
          <Link to="/" className="back">{isAr ? '→ الرئيسية' : '← Home'}</Link>
          <Link to="/" className="logo-sm"><img src="/assets/logo.svg" alt="Noch" style={{ height: 32 }} /></Link>
          {LangToggle}
        </nav>
        <div className="card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
          <h1 style={{ marginBottom: 12 }}>{isAr ? 'بطاقة نوتشي' : 'Nochi Pass'}</h1>
          <p>{isAr ? 'هذه البطاقة غير موجودة.' : "This pass doesn't exist."}</p>
          <p style={{ marginTop: 12, fontSize: 14, opacity: 0.85 }}>
            {isAr ? 'فقدت الإيصال؟ افتح بطاقتك بإدخال رقم هاتفك:' : 'Lost your receipt? Open your pass with your phone number:'}
          </p>
          <Link to="/loyalty" className="btn" style={{ marginTop: 8, display: 'inline-block', padding: '8px 16px', textDecoration: 'none' }}>
            {isAr ? 'افتح بطاقتي عبر رقم الهاتف' : 'Open my pass by phone'}
          </Link>
        </div>
      </div>
    )
  }

  const cycleProgress = Math.min(STAMP_GOAL, data.current_stamps || 0)
  const stampsLeft = Math.max(0, STAMP_GOAL - cycleProgress)
  const cycleStamps = Array.from({ length: STAMP_GOAL }, (_, i) => i < cycleProgress)
  const pendingRewards = Array.isArray(data.pending_rewards) ? data.pending_rewards : []
  const nochiSrc = NOCHI_IMG[data.nochi_state] || NOCHI_IMG.happy

  // Display value: prefer the array, fall back to legacy single field.
  const drinksList =
    Array.isArray(data.favorite_drinks) && data.favorite_drinks.length > 0
      ? data.favorite_drinks
      : data.favorite_drink ? [data.favorite_drink] : []

  return (
    <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <nav className="nav">
        <Link to="/" className="back">{isAr ? '→ الرئيسية' : '← Home'}</Link>
        <Link to="/" className="logo-sm">
          <img src="/assets/logo.svg" alt="Noch" style={{ height: 32 }} />
        </Link>
        {LangToggle}
      </nav>

      <div className="card" style={{ maxWidth: 520, margin: '24px auto', padding: 20 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img
            src={nochiSrc}
            alt={`Nochi ${data.nochi_state || 'happy'}`}
            style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 4 }}
            loading="eager"
          />
          <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>
            {isAr ? (NOCHI_LABEL_AR[data.nochi_state] || data.nochi_state) : data.nochi_state}
          </p>
          <h1 style={{ margin: '6px 0 2px' }}>{data.full_name}</h1>
          <p style={{ opacity: 0.5, fontSize: 12, margin: '2px 0 0', letterSpacing: 0.5 }}>
            {isAr ? '🐰 بطاقة نوتشي' : '🐰 Nochi Pass'}
          </p>
          <p style={{ opacity: 0.7, fontSize: 14, margin: '8px 0 0' }}>
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
              <div key={i} style={{ aspectRatio: '1 / 1', borderRadius: '50%', border: '2px solid currentColor', background: filled ? 'currentColor' : 'transparent', opacity: filled ? 1 : 0.25 }} />
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
        {(drinksList.length > 0 || data.favorite_other || data.milk_preference || data.sweetness_preference) && (
          <section style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>{isAr ? 'المعتاد' : 'Your usual'}</h2>
            {drinksList.length > 0 && (
              <p style={{ fontSize: 15, margin: 0 }}>
                {drinksList.join(' · ')}
                {data.milk_preference && (
                  <span style={{ opacity: 0.7, marginLeft: 8 }}> · {labelFor(MILK_OPTIONS, data.milk_preference, isAr)}</span>
                )}
                {data.sweetness_preference && (
                  <span style={{ opacity: 0.7, marginLeft: 8 }}> · {labelFor(SWEETNESS_OPTIONS, data.sweetness_preference, isAr)}</span>
                )}
              </p>
            )}
            {data.favorite_other && (
              <p style={{ fontSize: 14, margin: '6px 0 0', opacity: 0.85 }}>
                {isAr ? '🥐 وأيضاً: ' : '🥐 Also loves: '}{data.favorite_other}
              </p>
            )}
          </section>
        )}

        {/* Show-this-to-staff — only when there's an actual reward to claim */}
        {pendingRewards.length > 0 && (
          <div style={{ marginTop: 16, padding: 10, border: '1px dashed currentColor', borderRadius: 8, textAlign: 'center', opacity: 0.9 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              {isAr ? '🎁 أظهر هذه الصفحة للموظف لاستلام الجائزة' : '🎁 Show this page to staff to claim your reward'}
            </p>
          </div>
        )}

        {/* Edit */}
        <div style={{ marginTop: 16 }}>
          {showEdit ? (
            <EditPanel
              token={token}
              initial={{ ...data, favorite_drinks: drinksList }}
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
            ? 'خصوصية: لا نعرض رقم هاتفك على هذه الصفحة. للتعديل نطلب منك تأكيد رقم واتساب.'
            : "Privacy: your phone number isn't shown here. To edit, just confirm the WhatsApp number on file."}
        </p>
      </div>
    </div>
  )
}

// All active menu items, no category filter — three dropdowns let
// the customer pick anything we sell as their "top three".
function useMenuItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('pos_products')
          .select('id, name, name_ar')
          .eq('is_active', true)
          .order('name')
        if (error) throw error
        const seen = new Set()
        const out = []
        for (const p of data || []) {
          const key = (p.name || '').trim().toLowerCase()
          if (!key || seen.has(key)) continue
          seen.add(key)
          out.push({ name: p.name, name_ar: p.name_ar })
        }
        if (!cancelled) setItems(out)
      } catch {
        // dropdowns degrade to "Other / type below"
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { items, loading }
}

function DrinkPicker({ index, value, onChange, items, isAr }) {
  // Pre-resolve current selection: known menu item, "other" with custom
  // text, or empty.
  const knownName = useMemo(() => {
    if (!value) return ''
    const v = value.trim().toLowerCase()
    return items.some(d => (d.name || '').trim().toLowerCase() === v) ? value : OTHER_DRINK
  }, [value, items])

  const [sel, setSel] = useState(knownName)
  const [other, setOther] = useState(knownName === OTHER_DRINK ? value : '')

  useEffect(() => { setSel(knownName); setOther(knownName === OTHER_DRINK ? value : '') }, [knownName])

  const handleSel = (next) => {
    setSel(next)
    if (next === OTHER_DRINK) onChange(other || '')
    else onChange(next || '')
  }
  const handleOther = (text) => {
    setOther(text)
    onChange(text)
  }

  const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', font: 'inherit' }
  const labels = isAr
    ? { label: `مشروب ${index}`, pick: '— اختياري —', other: 'أخرى (أدخلها أسفل)', placeholder: 'مشروبي…' }
    : { label: `Drink ${index}`,    pick: '— optional —',     other: 'Other (type below)', placeholder: 'My drink…' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 13 }}>{labels.label}</span>
      <select style={inputStyle} value={sel} onChange={e => handleSel(e.target.value)}>
        <option value="">{labels.pick}</option>
        {items.map(d => (
          <option key={d.name} value={d.name}>
            {isAr && d.name_ar ? `${d.name_ar} (${d.name})` : d.name}
          </option>
        ))}
        <option value={OTHER_DRINK}>{labels.other}</option>
      </select>
      {sel === OTHER_DRINK && (
        <input
          style={{ ...inputStyle, marginTop: 6 }}
          value={other}
          onChange={e => handleOther(e.target.value)}
          placeholder={labels.placeholder}
        />
      )}
    </div>
  )
}

function EditPanel({ token, initial, isAr, onSaved, onCancel }) {
  const { items: menuItems } = useMenuItems()

  const initialDrinks = Array.isArray(initial.favorite_drinks) ? initial.favorite_drinks : []
  const [d1, setD1] = useState(initialDrinks[0] || '')
  const [d2, setD2] = useState(initialDrinks[1] || '')
  const [d3, setD3] = useState(initialDrinks[2] || '')

  const [phone, setPhone] = useState('')
  const [favoriteOther, setFavoriteOther] = useState(initial.favorite_other || '')
  const [milk, setMilk] = useState(initial.milk_preference || '')
  const [sweet, setSweet] = useState(initial.sweetness_preference || '')
  const [ig, setIg] = useState(initial.instagram_handle || '')
  const [tt, setTt] = useState(initial.tiktok_handle || '')
  const [fb, setFb] = useState(initial.facebook_handle || '')
  const [waOptIn, setWaOptIn] = useState(initial.whatsapp_opt_in !== false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    const digits = (phone || '').replace(/[^0-9]/g, '')
    if (digits.length < 6) {
      setErr(isAr ? 'أدخل رقم واتساب الكامل للتأكيد.' : 'Enter your full WhatsApp number to confirm.')
      return
    }

    const drinks = [d1, d2, d3].map(s => (s || '').trim()).filter(Boolean)

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('update_passport_preferences', {
        p_token: token,
        p_phone: phone,
        p_updates: {
          favorite_drinks: drinks,
          favorite_other: favoriteOther,
          milk_preference: milk,
          sweetness_preference: sweet,
          instagram_handle: ig.replace(/^@/, ''),
          tiktok_handle: tt.replace(/^@/, ''),
          facebook_handle: fb.replace(/^@/, ''),
          whatsapp_opt_in: waOptIn,
        },
      })
      if (error) throw error
      if (!data?.ok) {
        if (data?.error === 'verify_failed') setErr(isAr ? 'الرقم لا يطابق المسجّل عندنا.' : "That number doesn't match what's on file.")
        else if (data?.error === 'bad_phone') setErr(isAr ? 'الرقم غير صحيح.' : 'Phone number is too short.')
        else if (data?.error === 'not_found') setErr(isAr ? 'البطاقة غير موجودة.' : 'Pass not found.')
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
        <span style={{ fontSize: 13 }}>
          {isAr ? '📱 أكد رقم واتساب' : '📱 Confirm your WhatsApp number'}
        </span>
        <input
          style={inputStyle}
          inputMode="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder={isAr ? '‎+218 9X XXX XXXX' : '+218 9X XXX XXXX'}
          dir="ltr"
          required
          autoFocus
        />
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          {isAr ? 'نفس الرقم المسجّل عند الكاشير.' : 'Same number you gave us at the counter.'}
        </span>
      </label>

      <h3 style={{ fontSize: 14, marginTop: 16, marginBottom: 6 }}>
        {isAr ? 'مشروباتي المفضلة (حتى ٣)' : 'My favourite drinks (up to 3)'}
      </h3>
      <DrinkPicker index={1} value={d1} onChange={setD1} items={menuItems} isAr={isAr} />
      <DrinkPicker index={2} value={d2} onChange={setD2} items={menuItems} isAr={isAr} />
      <DrinkPicker index={3} value={d3} onChange={setD3} items={menuItems} isAr={isAr} />

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>{isAr ? '🥐 معجنات / حلويات / غير ذلك' : '🥐 Bakery / desserts / other items I love'}</span>
        <input
          style={inputStyle}
          value={favoriteOther}
          onChange={e => setFavoriteOther(e.target.value)}
          placeholder={isAr ? 'مثل: كرواسون، تشيز كيك…' : 'e.g. croissant, cheesecake…'}
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

      <label style={fieldStyle}>
        <span style={{ fontSize: 13 }}>Facebook</span>
        <input style={inputStyle} value={fb} onChange={e => setFb(e.target.value)} placeholder="yourhandle" dir="ltr" />
      </label>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, padding: '10px 12px', border: '1px dashed currentColor', borderRadius: 8 }}>
        <input type="checkbox" checked={waOptIn} onChange={e => setWaOptIn(e.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 14 }}>
          {isAr
            ? '📱 أوافق على استلام عروض، هدايا، ومفاجآت على واتساب'
            : "📱 Send me offers, freebies, and surprises on WhatsApp"}
        </span>
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
