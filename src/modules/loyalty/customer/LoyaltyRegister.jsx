// LoyaltyRegister — public, frictionless self-registration
// Reached by scanning the counter QR. URL: /loyalty/register?t=<token>&ref=<code>
// Customer fills 3 fields (name, phone, optional Nochi name), is registered,
// instantly receives their first stamp (the QR token is consumed), and lands
// on /my-card.

import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useLanguage } from '../../../contexts/LanguageContext'
import LanguageToggle from '../../../components/shared/LanguageToggle'
import NochiBunny from '../components/NochiBunny'
import toast from 'react-hot-toast'

export default function LoyaltyRegister() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const ar = lang === 'ar'

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    nochi_name: '',
    birthday_month: '',
    birthday_day: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // If a referral code is in the URL, capture it
  const refCode = params.get('ref')
  const qrToken = params.get('t')

  const submit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.phone.trim()) {
      toast.error(ar ? 'الاسم ورقم الهاتف مطلوبان' : 'Name and phone required')
      return
    }
    setSubmitting(true)
    try {
      // 1. Look up referrer if a code is present (via RPC — no row leak)
      let referredById = null
      if (refCode) {
        const { data: refId } = await supabase.rpc('resolve_referral_code', { p_code: refCode })
        referredById = refId || null
      }

      // 2. Insert customer
      const { data: created, error } = await supabase
        .from('loyalty_customers')
        .insert({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          nochi_name: form.nochi_name.trim() || null,
          birthday_month: form.birthday_month ? parseInt(form.birthday_month) : null,
          birthday_day: form.birthday_day ? parseInt(form.birthday_day) : null,
          referred_by_id: referredById,
          language: lang,
        })
        .select()
        .single()
      if (error) throw error

      // 3. If a QR token was passed, redeem it as the first stamp
      if (qrToken && created?.id) {
        await supabase.functions.invoke('loyalty-stamp', {
          body: { token: qrToken, customer_id: created.id },
        }).catch(() => {})
      }

      setRegistered(true)
      setTimeout(() => navigate('/my-card'), 1800)
    } catch (err) {
      const msg = err.message?.includes('duplicate') || err.code === '23505'
        ? (ar ? 'هذا الرقم مسجل مسبقاً' : 'This phone is already registered')
        : (err.message || 'Registration failed')
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Months for birthday dropdown
  const months = [
    { v: 1, ar: 'يناير', en: 'Jan' }, { v: 2, ar: 'فبراير', en: 'Feb' },
    { v: 3, ar: 'مارس', en: 'Mar' }, { v: 4, ar: 'أبريل', en: 'Apr' },
    { v: 5, ar: 'مايو', en: 'May' }, { v: 6, ar: 'يونيو', en: 'Jun' },
    { v: 7, ar: 'يوليو', en: 'Jul' }, { v: 8, ar: 'أغسطس', en: 'Aug' },
    { v: 9, ar: 'سبتمبر', en: 'Sep' }, { v: 10, ar: 'أكتوبر', en: 'Oct' },
    { v: 11, ar: 'نوفمبر', en: 'Nov' }, { v: 12, ar: 'ديسمبر', en: 'Dec' },
  ]

  if (registered) {
    return (
      <div className="min-h-screen bg-noch-dark flex items-center justify-center px-4">
        <div className="text-center">
          <NochiBunny state="happy" size="xl" lang={lang} />
          <h1 className="text-white font-bold text-2xl mt-4">
            {ar ? 'مرحباً بك!' : 'Welcome aboard!'}
          </h1>
          <p className="text-noch-muted text-sm mt-2">
            {ar
              ? `${form.nochi_name || 'نوتشي'} متحمس للقائك 🐰`
              : `${form.nochi_name || 'Nochi'} is excited to meet you 🐰`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-noch-dark flex flex-col items-center justify-start px-4 py-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <NochiBunny state="happy" size="lg" lang={lang} />
          <h1 className="text-white font-bold text-2xl tracking-tight mt-3">
            {ar ? 'قابل نوتشي 🐰' : 'Meet Nochi 🐰'}
          </h1>
          <p className="text-noch-muted text-sm mt-1">
            {ar
              ? 'بطاقة الولاء + الهدايا + المفاجآت. ٣٠ ثانية للتسجيل.'
              : 'Your loyalty, rewards & surprises. 30 seconds to set up.'}
          </p>
        </div>

        <div className="card">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="label">{ar ? 'اسمك' : 'Your name'}</label>
              <input className="input" value={form.full_name} onChange={set('full_name')} required autoFocus />
            </div>
            <div>
              <label className="label">{ar ? 'رقم الهاتف' : 'Phone'}</label>
              <input
                type="tel"
                inputMode="tel"
                className="input"
                placeholder="+218 …"
                value={form.phone}
                onChange={set('phone')}
                required
              />
            </div>
            <div>
              <label className="label">
                {ar ? 'سمِّ نوتشي الخاص بك (اختياري)' : 'Name your Nochi (optional)'}
              </label>
              <input
                className="input"
                placeholder={ar ? 'مثال: نوتي، فولفول، الكابتن…' : 'e.g. Bunny, Capt, Nochi Jr…'}
                value={form.nochi_name}
                onChange={set('nochi_name')}
                maxLength={20}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label">{ar ? 'شهر الميلاد' : 'Birth month'}</label>
                <select className="input" value={form.birthday_month} onChange={set('birthday_month')}>
                  <option value="">—</option>
                  {months.map(m => <option key={m.v} value={m.v}>{ar ? m.ar : m.en}</option>)}
                </select>
              </div>
              <div className="w-24">
                <label className="label">{ar ? 'اليوم' : 'Day'}</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="input"
                  value={form.birthday_day}
                  onChange={set('birthday_day')}
                />
              </div>
            </div>
            {refCode && (
              <p className="text-noch-green text-xs">
                {ar ? `تم استخدام رمز إحالة: ${refCode}` : `Referral code applied: ${refCode}`}
              </p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
              {submitting
                ? (ar ? 'جاري التسجيل…' : 'Setting you up…')
                : (ar ? 'ابدأ ✨' : 'Start ✨')}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-noch-muted text-xs">
          {ar ? 'بالفعل عضو؟ ' : 'Already a member? '}
          <Link to="/my-card" className="text-noch-green hover:underline">
            {ar ? 'افتح بطاقتك' : 'Open your card'}
          </Link>
        </p>
        <div className="flex justify-center mt-4">
          <LanguageToggle />
        </div>
      </div>
    </div>
  )
}
