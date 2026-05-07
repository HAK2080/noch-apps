import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { getTasks, createTask, assignStaffToTask, uploadAttachment, getStaffProfiles } from '../lib/supabase'
import { sendTelegram } from '../lib/telegram'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import TaskForm from '../components/tasks/TaskForm'
import PriorityBadge from '../components/shared/PriorityBadge'
import toast from 'react-hot-toast'

const STATUS_FILTERS = ['all', 'pending', 'in_progress', 'done']

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function Tasks() {
  const { t, lang } = useLanguage()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filters = statusFilter !== 'all' ? { status: statusFilter } : {}
      const data = await getTasks(filters)
      setTasks(data)
    } catch {
      toast.error(t('error'))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const handleSave = async (payload, files) => {
    const { notifyTelegram, assigneeIds, ...taskPayload } = payload
    try {
      const task = await createTask(taskPayload)
      if (assigneeIds?.length) {
        await Promise.allSettled(assigneeIds.map(id => assignStaffToTask(task.id, id, task.created_by)))
      }
      let attachmentUrls = []
      if (files?.length) {
        const uploads = await Promise.all(files.map(f => uploadAttachment(task.id, f)))
        attachmentUrls = uploads.map(u => u.file_url)
      }
      if (notifyTelegram) {
        try {
          const idsToNotify = assigneeIds?.length ? assigneeIds : (taskPayload.assigned_to ? [taskPayload.assigned_to] : [])
          if (idsToNotify.length > 0) {
            const allStaff = await getStaffProfiles()
            const recipients = allStaff.filter(p => idsToNotify.includes(p.id) && p.telegram_chat_id)
            if (recipients.length > 0) {
              const priority = { urgent: 'عاجل ⚡', high: 'مرتفع 🔴', medium: 'متوسط 🟡', low: 'منخفض 🟢' }
              await Promise.all(recipients.map(p => {
                let msg = `مرحبا ${p.full_name}! عندك مهمة جديدة 📋\n\n*${task.title}*\n` +
                  (task.description ? `${task.description}\n\n` : '\n') +
                  `الأولوية: ${priority[task.priority] || task.priority}\n` +
                  (task.due_date ? `الموعد النهائي: ${task.due_date}\n` : '')
                if (attachmentUrls.length) msg += `\n📎 المرفقات:\n${attachmentUrls.join('\n')}`
                msg += `\n— فريق بلوم - نوتش ☕`
                return sendTelegram(p.telegram_chat_id, msg)
              }))
              if (profile?.telegram_chat_id) {
                const names = recipients.map(p => p.full_name).join('، ')
                await sendTelegram(profile.telegram_chat_id, `✅ تم إرسال المهمة "${task.title}" إلى: ${names}`)
              }
            }
          }
        } catch {
          toast.error(lang === 'ar' ? 'تم إنشاء المهمة لكن فشل إرسال التيليغرام' : 'Task created but Telegram failed')
        }
      }
      toast.success(t('taskCreated'))
      setShowForm(false)
      load()
    } catch {
      toast.error(t('error'))
    }
  }

  const today = new Date().toISOString().split('T')[0]

  const statusLabel = {
    all: lang === 'ar' ? 'الكل' : 'All',
    pending: lang === 'ar' ? 'معلقة' : 'Pending',
    in_progress: lang === 'ar' ? 'جارية' : 'In Progress',
    done: lang === 'ar' ? 'منتهية' : 'Done',
  }

  const statusBadge = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    done: 'bg-green-500/10 text-noch-green border-green-500/30',
  }

  const sorted = [...tasks].sort((a, b) => {
    // Overdue first, then by priority, then by due date
    const aOver = a.due_date && a.due_date < today && a.status !== 'done'
    const bOver = b.due_date && b.due_date < today && b.status !== 'done'
    if (aOver && !bOver) return -1
    if (!aOver && bOver) return 1
    const pa = priorityOrder[a.priority] ?? 99
    const pb = priorityOrder[b.priority] ?? 99
    return pa - pb
  })

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white font-bold text-xl">{lang === 'ar' ? 'المهام' : 'Tasks'}</h1>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary p-2.5" title={lang === 'ar' ? 'تحديث' : 'Refresh'}><RefreshCw size={16} /></button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span className="hidden sm:inline">{lang === 'ar' ? 'مهمة جديدة' : 'New Task'}</span>
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${statusFilter === s
                ? 'bg-noch-green text-noch-dark'
                : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'
              }`}
          >
            {statusLabel[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-16">{t('loading')}</p>
      ) : sorted.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-noch-muted">{lang === 'ar' ? 'لا توجد مهام' : 'No tasks found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(task => {
            const overdue = task.due_date && task.due_date < today && task.status !== 'done'
            return (
              <div
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}`)}
                className={`card cursor-pointer hover:border-noch-green/30 transition-colors flex items-center justify-between gap-3
                  ${overdue ? 'border-red-500/30 bg-red-500/5' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <PriorityBadge priority={task.priority} />
                    {overdue && (
                      <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
                        {lang === 'ar' ? 'متأخر' : 'Overdue'}
                      </span>
                    )}
                  </div>
                  <p className="text-white text-sm font-medium truncate">{task.title}</p>
                  {task.due_date && (
                    <p className={`text-xs mt-0.5 ${overdue ? 'text-red-400' : 'text-noch-muted'}`}>
                      {lang === 'ar' ? 'الموعد: ' : 'Due: '}{task.due_date}
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${statusBadge[task.status] || 'bg-noch-card border-noch-border text-noch-muted'}`}>
                  {statusLabel[task.status] || task.status}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <TaskForm onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}
    </Layout>
  )
}
