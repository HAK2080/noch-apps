import { useState } from 'react'
import { Bell, X, Trash2 } from 'lucide-react'
import { createReminder, deleteReminder } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import toast from 'react-hot-toast'

const FREQ_OPTIONS = [
  { value: 'daily',        ar: 'يومياً',           en: 'Daily' },
  { value: 'every2days',   ar: 'كل يومين',          en: 'Every 2 days' },
  { value: 'weekly',       ar: 'أسبوعياً',          en: 'Weekly' },
  { value: 'specific_date', ar: 'تاريخ محدد',       en: 'Specific date' },
  { value: 'custom',       ar: 'مخصص (كل X أيام)',  en: 'Custom (every X days)' },
]

export default function ReminderForm({ taskId, telegramChatId, reminders, onRemindersChange }) {
  const { lang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    frequency: 'daily',
    sendTime: '09:00',
    specificDate: '',
    intervalDays: 3,
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!telegramChatId) {
      return toast.error(lang === 'ar' ? 'لا يوجد حساب تيليغرام لهذا الموظف' : 'No Telegram account for this staff member')
    }
    if (form.frequency === 'specific_date' && !form.specificDate) {
      return toast.error(lang === 'ar' ? 'اختر تاريخاً' : 'Please select a date')
    }
    setSaving(true)
    try {
      const reminder = await createReminder(taskId, telegramChatId, form.frequency, {
        sendTime: form.sendTime,
        specificDate: form.frequency === 'specific_date' ? form.specificDate : undefined,
        intervalDays: form.frequency === 'custom' ? Number(form.intervalDays) : undefined,
      })
      onRemindersChange([...reminders, reminder])
      setOpen(false)
      toast.success(lang === 'ar' ? 'تم تفعيل التذكير عبر تيليغرام' : 'Telegram reminder set')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteReminder(id)
      onRemindersChange(reminders.filter(r => r.id !== id))
      toast.success(lang === 'ar' ? 'تم حذف التذكير' : 'Reminder removed')
    } catch {
      toast.error(lang === 'ar' ? 'خطأ في الحذف' : 'Error removing reminder')
    }
  }

  const freqLabel = (freq) => {
    const opt = FREQ_OPTIONS.find(o => o.value === freq)
    return opt ? opt[lang] : freq
  }

  return (
    <div className="mt-4">
      {/* Existing reminders */}
      {reminders.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {reminders.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-noch-dark rounded-xl px-3 py-2 border border-noch-border">
              <div className="flex items-center gap-2 text-sm">
                <Bell size={13} className="text-noch-green flex-shrink-0" />
                <span className="text-white">{freqLabel(r.frequency)}</span>
                <span className="text-noch-muted">{r.send_time}</span>
                {r.specific_date && <span className="text-noch-muted">— {r.specific_date}</span>}
                <span className="text-noch-muted text-xs">• Telegram</span>
              </div>
              <button onClick={() => handleDelete(r.id)} className="text-noch-muted hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add reminder button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="btn-secondary flex items-center gap-2 text-sm w-full justify-center"
        >
          <Bell size={14} />
          {lang === 'ar' ? 'إضافة تذكير تيليغرام' : 'Add Telegram Reminder'}
        </button>
      )}

      {/* Reminder form */}
      {open && (
        <div className="bg-noch-dark border border-noch-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-white text-sm font-semibold">{lang === 'ar' ? 'تذكير جديد عبر تيليغرام' : 'New Telegram Reminder'}</p>
            <button onClick={() => setOpen(false)} className="text-noch-muted hover:text-white"><X size={16} /></button>
          </div>

          {/* Frequency */}
          <div>
            <label className="label text-xs">{lang === 'ar' ? 'التكرار' : 'Frequency'}</label>
            <select className="input text-sm" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
              {FREQ_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o[lang]}</option>
              ))}
            </select>
          </div>

          {/* Specific date picker */}
          {form.frequency === 'specific_date' && (
            <div>
              <label className="label text-xs">{lang === 'ar' ? 'التاريخ' : 'Date'}</label>
              <input
                type="date"
                className="input text-sm"
                value={form.specificDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => set('specificDate', e.target.value)}
              />
            </div>
          )}

          {/* Custom interval */}
          {form.frequency === 'custom' && (
            <div>
              <label className="label text-xs">{lang === 'ar' ? 'كل كم يوم؟' : 'Every how many days?'}</label>
              <input
                type="number"
                className="input text-sm"
                min={1}
                max={30}
                value={form.intervalDays}
                onChange={e => set('intervalDays', e.target.value)}
              />
            </div>
          )}

          {/* Send time */}
          <div>
            <label className="label text-xs">{lang === 'ar' ? 'وقت الإرسال' : 'Send time'}</label>
            <input
              type="time"
              className="input text-sm"
              value={form.sendTime}
              onChange={e => set('sendTime', e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 text-sm">
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1 text-sm">
              {saving ? '...' : lang === 'ar' ? 'حفظ التذكير' : 'Save Reminder'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
