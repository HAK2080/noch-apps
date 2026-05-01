import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from '../components/shared/LanguageToggle'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function StaffAccessRequest() {
  const { lang } = useLanguage()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('staff_access_requests').insert({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        note: form.note.trim() || null,
      })
      if (error) {
        if (error.message?.includes('rate_limited')) {
          throw new Error(lang === 'ar'
            ? 'محاولات كثيرة جداً. حاول مرة أخرى لاحقاً.'
            : 'Too many requests from this address. Try again later.')
        }
        if (error.code === '23505') {
          throw new Error(lang === 'ar'
            ? 'لديك طلب قيد المراجعة بالفعل بهذا البريد.'
            : 'A pending request already exists for this email.')
        }
        throw new Error(error.message)
      }
      setSubmitted(true)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-noch-dark flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-noch-green font-bold text-5xl tracking-tight mb-1">noch.apps</h1>
          <p className="text-noch-muted text-sm">
            {lang === 'ar' ? 'طلب وصول الموظف' : 'Staff access request'}
          </p>
        </div>

        <div className="card">
          {submitted ? (
            <div className="text-center py-4">
              <div className="text-noch-green text-5xl mb-3">✓</div>
              <h2 className="text-white font-semibold mb-2">
                {lang === 'ar' ? 'تم استلام الطلب' : 'Request received'}
              </h2>
              <p className="text-noch-muted text-sm mb-5">
                {lang === 'ar'
                  ? 'سيراجع المالك طلبك. ستصلك رسالة بالبريد الإلكتروني عند الموافقة.'
                  : "We'll email you once the owner approves. Check your inbox (and spam) for the invite link."}
              </p>
              <Link to="/login" className="text-noch-green text-sm hover:underline">
                {lang === 'ar' ? '← العودة لتسجيل الدخول' : '← Back to login'}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-white font-semibold text-center mb-5">
                {lang === 'ar' ? 'طلب الوصول' : 'Request access'}
              </h2>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                  <label className="label">{lang === 'ar' ? 'الاسم الكامل' : 'Full name'}</label>
                  <input className="input" value={form.full_name} onChange={set('full_name')} required />
                </div>
                <div>
                  <label className="label">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
                  <input type="email" className="input" value={form.email} onChange={set('email')} autoComplete="email" required />
                </div>
                <div>
                  <label className="label">{lang === 'ar' ? 'الهاتف (اختياري)' : 'Phone (optional)'}</label>
                  <input className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" />
                </div>
                <div>
                  <label className="label">{lang === 'ar' ? 'ملاحظة (اختياري)' : 'Note (optional)'}</label>
                  <textarea className="input" rows={3} value={form.note} onChange={set('note')}
                    placeholder={lang === 'ar' ? 'ما الدور الذي تتقدم له؟' : 'What role are you applying for?'} />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full mt-2">
                  {submitting
                    ? (lang === 'ar' ? 'جاري الإرسال...' : 'Submitting...')
                    : (lang === 'ar' ? 'إرسال الطلب' : 'Submit request')}
                </button>
              </form>
              <p className="text-center mt-4">
                <Link to="/login" className="text-noch-muted text-xs hover:text-white">
                  {lang === 'ar' ? '← العودة لتسجيل الدخول' : '← Back to login'}
                </Link>
              </p>
            </>
          )}
        </div>

        <div className="flex justify-center mt-6">
          <LanguageToggle />
        </div>
      </div>
    </div>
  )
}
