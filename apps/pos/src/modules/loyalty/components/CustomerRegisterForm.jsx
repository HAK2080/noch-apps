// CustomerRegisterForm — Quick register a new loyalty customer

import { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { useLanguage } from '../../../contexts/LanguageContext'
import { registerLoyaltyCustomer } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function CustomerRegisterForm({ onSuccess, onCancel }) {
  const { lang } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ full_name: '', telegram_id: '', whatsapp: '', birthday_day: '', birthday_month: '', referral_code: '' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) {
      return toast.error(lang === 'ar' ? 'الاسم مطلوب' : 'Name required')
    }
    if (!form.telegram_id.trim() && !form.whatsapp.trim()) {
      return toast.error(lang === 'ar' ? 'تيليغرام أو واتس آب مطلوب' : 'Telegram or WhatsApp required')
    }

    // Format birthday if provided
    let birthday = null
    if (form.birthday_day && form.birthday_month) {
      const day = form.birthday_day.padStart(2, '0')
      const month = form.birthday_month.padStart(2, '0')
      // Use a placeholder year (1990) since year not provided
      birthday = `1990-${month}-${day}`
    }

    setLoading(true)
    try {
      const customer = await registerLoyaltyCustomer({
        full_name: form.full_name.trim(),
        phone: form.telegram_id.trim() || form.whatsapp.trim(), // store telegram as phone for now
        birthday,
        registered_by: user?.id,
        notes: `Telegram: ${form.telegram_id} | WhatsApp: ${form.whatsapp}`,
      })
      toast.success(lang === 'ar' ? `مرحباً ${customer.full_name}! تم التسجيل 🐰` : `Welcome ${customer.full_name}! Registered 🐰`)
      onSuccess?.(customer)
    } catch (err) {
      console.error('Registration error:', err)
      const msg = err.message || (lang === 'ar' ? 'خطأ في التسجيل' : 'Registration error')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 px-0 md:px-4">
      <div className="card w-full md:max-w-md rounded-t-3xl md:rounded-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-noch-green" />
            <h2 className="text-white font-bold">{lang === 'ar' ? 'تسجيل عميل جديد' : 'Register New Customer'}</h2>
          </div>
          <button onClick={onCancel} className="text-noch-muted hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="label">{lang === 'ar' ? 'الاسم الكامل' : 'Full Name'} *</label>
            <input
              className="input"
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder={lang === 'ar' ? 'أحمد محمد' : 'Ahmed Mohammed'}
            />
          </div>
          <div>
            <label className="label">{lang === 'ar' ? 'معرّف تيليغرام' : 'Telegram Chat ID'} *</label>
            <input
              className="input"
              value={form.telegram_id}
              onChange={e => set('telegram_id', e.target.value)}
              placeholder={lang === 'ar' ? '@example أو معرف رقمي' : '@username or numeric ID'}
              dir="ltr"
            />
          </div>
          <div>
            <label className="label">{lang === 'ar' ? 'رقم واتس آب (اختياري)' : 'WhatsApp Number (optional)'}</label>
            <input
              className="input"
              value={form.whatsapp}
              onChange={e => set('whatsapp', e.target.value)}
              placeholder={lang === 'ar' ? '+218 9XX XXX XXXX' : '+216 9XX XXX XXXX'}
              dir="ltr"
            />
          </div>
          <div>
            <label className="label">{lang === 'ar' ? 'عيد الميلاد (اختياري)' : 'Birthday (optional)'}</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input flex-1"
                min="1" max="31"
                value={form.birthday_day}
                onChange={e => set('birthday_day', e.target.value)}
                placeholder={lang === 'ar' ? 'يوم' : 'Day'}
              />
              <input
                type="number"
                className="input flex-1"
                min="1" max="12"
                value={form.birthday_month}
                onChange={e => set('birthday_month', e.target.value)}
                placeholder={lang === 'ar' ? 'شهر' : 'Month'}
              />
            </div>
            <p className="text-xs text-noch-muted mt-1">{lang === 'ar' ? 'صيغة: يوم/شهر (DD/MM)' : 'Format: Day/Month (DD/MM)'}</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? '...' : (lang === 'ar' ? '🐰 سجّل' : '🐰 Register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
