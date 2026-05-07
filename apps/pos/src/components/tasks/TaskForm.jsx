import { useState, useEffect } from 'react'
import { X, Paperclip, MessageCircle } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getStaffProfiles } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const PRIORITIES = ['urgent', 'high', 'medium', 'low']
const PRIORITY_LABELS = { ar: { urgent: 'عاجل', high: 'مرتفع', medium: 'متوسط', low: 'منخفض' }, en: { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' } }

export default function TaskForm({ task, onSave, onCancel }) {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const [staff, setStaff] = useState([])
  const [pendingFiles, setPendingFiles] = useState([])
  const [notifyTelegram, setNotifyTelegram] = useState(false)

  const isEdit = !!task

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assigned_to: task?.assigned_to || '',
    assignees: task?.assignees?.map(a => a.assignee_id) || (task?.assigned_to ? [task.assigned_to] : []),
    due_date: task?.due_date || '',
    priority: task?.priority || 'medium',
    is_group: task?.is_group || false,
    created_by: user?.id,
  })

  useEffect(() => {
    getStaffProfiles().then(setStaff).catch(() => {})
  }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleAssignee = (staffId) => {
    setForm(f => {
      const newAssignees = f.assignees.includes(staffId)
        ? f.assignees.filter(id => id !== staffId)
        : [...f.assignees, staffId]
      return {
        ...f,
        assignees: newAssignees,
        assigned_to: newAssignees[0] || '', // Set primary to first
      }
    })
  }

  const selectedStaff = staff.find(s => s.id === form.assigned_to)
  const canNotify = !isEdit && !!form.assigned_to && !!selectedStaff?.telegram_chat_id

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    setPendingFiles(prev => [...prev, ...files])
  }

  const removeFile = (index) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('أدخل عنوان المهمة')
    const payload = {
      title: form.title,
      description: form.description,
      assigned_to: form.assigned_to || null,
      assigneeIds: form.assignees,  // full list for task_assignments junction table
      due_date: form.due_date || null,
      priority: form.priority,
      is_group: form.is_group,
      has_attachments: pendingFiles.length > 0,
      notifyTelegram: canNotify && notifyTelegram,
      created_by: user?.id || null,
    }
    onSave(payload, pendingFiles)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 px-0 md:px-4">
      <div className="card w-full md:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-lg">{task ? t('editTask') : t('newTask')}</h2>
          <button onClick={onCancel} className="text-noch-muted hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="label">{t('taskTitle')} *</label>
            <input
              className="input"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder={lang === 'ar' ? 'مثال: نظّف ماكينة الإسبريسو' : 'e.g. Clean the espresso machine'}
            />
          </div>

          {/* Description */}
          <div>
            <label className="label">{t('taskDescription')}</label>
            <textarea
              className="input resize-none h-20"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder={lang === 'ar' ? 'تفاصيل إضافية...' : 'Additional details...'}
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="label">{t('dueDate')}</label>
            <input
              type="date"
              className="input"
              value={form.due_date}
              onChange={e => set('due_date', e.target.value)}
              style={{ colorScheme: 'dark' }}
            />
            {form.due_date && (
              <p className="text-xs text-noch-muted mt-1">
                {new Date(form.due_date + 'T00:00:00').toLocaleDateString('en-GB')}
              </p>
            )}
          </div>

          {/* Assign To (Multi-select) */}
          <div>
            <label className="label">{t('assignTo')}</label>
            <div className="space-y-2">
              {staff.length > 0 ? (
                staff.map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-noch-dark/50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={form.assignees.includes(s.id)}
                      onChange={() => toggleAssignee(s.id)}
                      className="w-4 h-4 accent-noch-green"
                    />
                    <span className="text-sm text-white flex-1">{s.full_name}</span>
                    {s.telegram_chat_id && (
                      <span className="text-[#229ED9] text-xs bg-[#229ED9]/10 px-1.5 py-0.5 rounded-full">Telegram</span>
                    )}
                  </label>
                ))
              ) : (
                <p className="text-sm text-noch-muted">{lang === 'ar' ? 'لا يوجد موظفين' : 'No staff members'}</p>
              )}
            </div>
            {form.assignees.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {form.assignees.map(id => {
                  const s = staff.find(st => st.id === id)
                  return s ? (
                    <div key={id} className="flex items-center gap-2 bg-noch-green/20 text-noch-green text-xs px-2.5 py-1 rounded-full border border-noch-green/40">
                      <span>{s.full_name}</span>
                      <button type="button" onClick={() => toggleAssignee(id)} className="hover:text-white">
                        <X size={14} />
                      </button>
                    </div>
                  ) : null
                })}
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="label">{t('priority')}</label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('priority', p)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all
                    ${form.priority === p
                      ? p === 'urgent' ? 'bg-red-500/20 border-red-500 text-red-400'
                      : p === 'high' ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                      : p === 'medium' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                      : 'bg-zinc-500/20 border-zinc-500 text-zinc-400'
                      : 'border-noch-border text-noch-muted hover:border-noch-green/40'
                    }`}
                >
                  {PRIORITY_LABELS[lang][p]}
                </button>
              ))}
            </div>
          </div>

          {/* Group task toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set('is_group', !form.is_group)}
              className={`w-11 h-6 rounded-full transition-colors relative
                ${form.is_group ? 'bg-noch-green' : 'bg-noch-border'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all
                ${form.is_group ? 'start-5' : 'start-0.5'}`} />
            </div>
            <span className="text-sm text-noch-muted">{t('groupTask')}</span>
          </label>

          {/* Attachments */}
          <div>
            <label className="label">{t('attachments')}</label>
            <label className="flex items-center gap-2 text-sm text-noch-muted border border-dashed border-noch-border rounded-xl px-4 py-3 cursor-pointer hover:border-noch-green/40 transition-colors">
              <Paperclip size={16} />
              <span>{lang === 'ar' ? 'أضف ملف أو صورة' : 'Add file or image'}</span>
              <input type="file" multiple className="hidden" onChange={handleFileChange} />
            </label>
            {pendingFiles.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {pendingFiles.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-noch-muted bg-noch-dark rounded-lg px-3 py-2">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-red-400 hover:text-red-300 ms-2">
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Telegram notify toggle — only on create with an assigned staff who has a chat ID */}
          {canNotify && (
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-noch-border hover:border-noch-green/40 transition-colors">
              <div
                onClick={() => setNotifyTelegram(v => !v)}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0
                  ${notifyTelegram ? 'bg-noch-green' : 'bg-noch-border'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all
                  ${notifyTelegram ? 'start-5' : 'start-0.5'}`} />
              </div>
              <div>
                <p className="text-sm text-white font-medium flex items-center gap-1.5">
                  <MessageCircle size={14} className="text-noch-green" />
                  {lang === 'ar' ? 'إرسال إشعار تيليغرام' : 'Send Telegram notification'}
                </p>
                <p className="text-xs text-noch-muted mt-0.5">
                  {lang === 'ar' ? `إلى ${selectedStaff?.full_name}` : `To ${selectedStaff?.full_name}`}
                </p>
              </div>
            </label>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">{t('cancel')}</button>
            <button type="submit" className="btn-primary flex-1">
              {t('saveTask')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
