import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Trash2, Bell, Edit, Paperclip, ExternalLink, Users } from 'lucide-react'
import { getTask, updateTask, deleteTask, getTaskAttachments, uploadAttachment, getReminders, assignStaffToTask, removeAssignmentFromTask, requestTaskCompletion, approveTaskCompletion, rejectTaskCompletion, getProfiles } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import Layout from '../components/Layout'
import PriorityBadge from '../components/shared/PriorityBadge'
import StatusBadge from '../components/shared/StatusBadge'
import TaskComments from '../components/tasks/TaskComments'
import TaskForm from '../components/tasks/TaskForm'
import ConfirmModal from '../components/shared/ConfirmModal'
import ReminderForm from '../components/tasks/ReminderForm'
import { formatDueDate, isOverdue } from '../lib/supabase'
import { sendTelegram } from '../lib/telegram'
import toast from 'react-hot-toast'

const STATUS_FLOW = ['pending', 'in_progress', 'done']
// State labels: shown on the DISABLED current-status button
const STATUS_STATE_LABELS = {
  ar: { pending: '⏳ معلقة', in_progress: '🔄 جارية', done: '✓ منتهية' },
  en: { pending: '⏳ Pending', in_progress: '🔄 In Progress', done: '✓ Done' },
}
// Action labels: shown on the GREEN next-action button
const STATUS_ACTION_LABELS = {
  ar: { pending: '▶ ابدأ', in_progress: '✓ خلّصت', done: '✓ خلّصت' },
  en: { pending: '▶ Start', in_progress: '✓ Mark Done', done: '✓ Done' },
}

function buildReminderMessage(task, recipientName) {
  const priority = { urgent: 'عاجل ⚡', high: 'مرتفع 🔴', medium: 'متوسط 🟡', low: 'منخفض 🟢' }
  return `مرحبا ${recipientName || ''}! 🔔 تذكير بمهمة\n\n` +
    `*${task.title}*\n` +
    (task.description ? `${task.description}\n\n` : '\n') +
    `الأولوية: ${priority[task.priority] || task.priority}\n` +
    (task.due_date ? `الموعد النهائي: ${task.due_date}\n` : '') +
    `\n— فريق بلوم - نوتش ☕`
}

// helpers to normalize both single-assign (task.assignee = profile) and multi-assign (task.assignees = [{assignee: profile}])
const getChatId = (a) => a.assignee?.telegram_chat_id || a.telegram_chat_id
const getDisplayName = (a) => a.assignee?.full_name || a.full_name || ''

function buildCompletionMessage(task) {
  return `✅ *تم إنجاز مهمة*\n\n` +
    `*${task.title}*\n` +
    (task.description ? `${task.description}\n\n` : '\n') +
    `أنجزها: ${task.assignee?.full_name || ''}\n` +
    `\n— فريق بلوم - نوتش ☕`
}

function buildCompletionThankYouMessage(task) {
  return `✅ *شكراً على إنجازك للمهمة*\n\n` +
    `*${task.title}*\n\n` +
    `شكراً لك على تفانيك والتزامك. أداؤك الممتاز مقدر كثيراً! 🙏\n` +
    `\n— فريق بلوم - نوتش ☕`
}

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isOwner, profile } = useAuth()
  const { t, lang } = useLanguage()

  const [task, setTask] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)

  useEffect(() => {
    // Load task first — critical. Attachments and reminders are non-critical.
    getTask(id)
      .then(t => {
        setTask(t)
        // Load non-critical data in parallel, ignore individual failures
        Promise.allSettled([getTaskAttachments(id), getReminders(id)])
          .then(([attachRes, remindRes]) => {
            if (attachRes.status === 'fulfilled') setAttachments(attachRes.value)
            if (remindRes.status === 'fulfilled') setReminders(remindRes.value)
          })
      })
      .catch(() => {
        // Task not found or not accessible — the !task render below handles the UI
      })
      .finally(() => setLoading(false))
  }, [id])

  const handleStatusUpdate = async (newStatus) => {
    setUpdatingStatus(true)
    try {
      const updated = await updateTask(id, { status: newStatus })
      setTask(updated)
      toast.success(t('statusUpdated'))

      // Notify when task is marked done
      if (newStatus === 'done') {
        // Notify owner via Telegram
        if (profile?.telegram_chat_id) {
          try {
            await sendTelegram(profile.telegram_chat_id, buildCompletionMessage(updated), id)
          } catch {
            // Non-blocking
          }
        }

        // Thank assignee(s) via Telegram
        if (updated.assignees && updated.assignees.length > 0) {
          const assigneesWithTelegram = updated.assignees.filter(a => a.assignee?.telegram_chat_id)
          if (assigneesWithTelegram.length > 0) {
            try {
              await Promise.all(
                assigneesWithTelegram.map(a =>
                  sendTelegram(a.assignee.telegram_chat_id, buildCompletionThankYouMessage(updated), id)
                )
              )
            } catch {
              // Non-blocking
            }
          }
        } else if (updated.assignee?.telegram_chat_id) {
          // Fallback for single assignee
          try {
            await sendTelegram(updated.assignee.telegram_chat_id, buildCompletionThankYouMessage(updated), id)
          } catch {
            // Non-blocking
          }
        }
      }
    } catch {
      toast.error(t('error'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleEdit = async (payload, files) => {
    const { notifyTelegram, created_by, assigneeIds, ...taskPayload } = payload
    try {
      const updated = await updateTask(id, taskPayload)

      // Sync task_assignments: diff old vs new
      if (assigneeIds) {
        const existing = (task.assignees || []).map(a => a.assignee_id)
        const toAdd = assigneeIds.filter(aid => !existing.includes(aid))
        const toRemove = existing.filter(aid => !assigneeIds.includes(aid))
        await Promise.allSettled([
          ...toAdd.map(aid => assignStaffToTask(id, aid, profile?.id)),
          ...toRemove.map(aid => removeAssignmentFromTask(id, aid)),
        ])
      }

      if (files?.length) {
        const uploaded = await Promise.all(files.map(f => uploadAttachment(id, f)))
        setAttachments(prev => [...prev, ...uploaded])
      }
      setTask(updated)
      setEditing(false)
      toast.success(t('taskUpdated'))
    } catch {
      toast.error(t('error'))
    }
  }

  const handleDelete = async () => {
    try {
      await deleteTask(id)
      toast.success(t('taskDeleted'))
      navigate(-1)
    } catch {
      toast.error(t('error'))
    }
  }

  const sendReminder = async () => {
    const assignees = task.assignees && task.assignees.length > 0 ? task.assignees : (task.assignee ? [task.assignee] : [])
    const recipientsWithTelegram = assignees.filter(a => getChatId(a))

    if (recipientsWithTelegram.length === 0) return toast.error('لا يوجد حساب تيليغرام لأي موظف')
    try {
      const attachmentSuffix = attachments.length ? `\n\n📎 المرفقات:\n${attachments.map(a => a.file_url).join('\n')}` : ''
      await Promise.all(
        recipientsWithTelegram.map(a => {
          const msg = buildReminderMessage(task, getDisplayName(a)) + attachmentSuffix
          return sendTelegram(getChatId(a), msg, id)
        })
      )
      if (profile?.telegram_chat_id) {
        const names = recipientsWithTelegram.map(a => getDisplayName(a)).join('، ')
        await sendTelegram(profile.telegram_chat_id, `✅ تم إرسال تذكير للمهمة "${task.title}" إلى: ${names}`)
      }
      toast.success(t('reminderSent'))
    } catch (err) {
      toast.error(err.message || t('error'))
    }
  }

  const handleRequestCompletion = async () => {
    setUpdatingStatus(true)
    try {
      const updated = await requestTaskCompletion(id)
      setTask(updated)
      toast.success(lang === 'ar' ? 'تم إرسال طلب الإنهاء للمدير' : 'Completion requested — awaiting owner approval')
      // Notify owner via Telegram — fetch owner profile to get their chat ID
      try {
        const staffName = profile?.full_name || ''
        const allProfiles = await getProfiles()
        const owner = allProfiles.find(p => p.role === 'owner')
        if (owner?.telegram_chat_id) {
          await sendTelegram(owner.telegram_chat_id, `📋 طلب إنهاء مهمة\n\n*${updated.title}*\n\nيطلب ${staffName} الموافقة على إنهاء هذه المهمة.`, id)
        }
      } catch {}
    } catch { toast.error(t('error')) }
    finally { setUpdatingStatus(false) }
  }

  const handleApprove = async () => {
    setUpdatingStatus(true)
    try {
      const updated = await approveTaskCompletion(id)
      setTask(updated)
      toast.success(lang === 'ar' ? 'تمت الموافقة — المهمة منجزة ✅' : 'Approved — task marked done ✅')
      // Notify assignees
      const assignees = updated.assignees?.length ? updated.assignees : (updated.assignee ? [updated.assignee] : [])
      for (const a of assignees) {
        const chatId = getChatId(a)
        if (chatId) {
          try { await sendTelegram(chatId, `✅ تمت الموافقة على إنهاء المهمة\n\n*${updated.title}*\n\nأحسنت! تم تأكيد إنجاز المهمة من قِبل المدير. 🎉`, id) } catch {}
        }
      }
    } catch { toast.error(t('error')) }
    finally { setUpdatingStatus(false) }
  }

  const handleReject = async () => {
    setUpdatingStatus(true)
    setShowRejectModal(false)
    try {
      const updated = await rejectTaskCompletion(id, rejectNote)
      setTask(updated)
      setRejectNote('')
      toast.success(lang === 'ar' ? 'تم إرجاع المهمة للموظف' : 'Task sent back to staff')
      // Notify assignees
      const assignees = updated.assignees?.length ? updated.assignees : (updated.assignee ? [updated.assignee] : [])
      for (const a of assignees) {
        const chatId = getChatId(a)
        if (chatId) {
          const note = rejectNote ? `\n\nملاحظة: ${rejectNote}` : ''
          try { await sendTelegram(chatId, `↩ تم إرجاع طلب الإنهاء\n\n*${updated.title}*${note}\n\nيرجى مراجعة المهمة والتواصل مع المدير.`, id) } catch {}
        }
      }
    } catch { toast.error(t('error')) }
    finally { setUpdatingStatus(false) }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">{t('loading')}</p></Layout>
  if (!task) return <Layout><p className="text-noch-muted text-center py-16">Task not found</p></Layout>

  const overdue = isOverdue(task)
  const currentStatusIndex = STATUS_FLOW.indexOf(task.status)

  return (
    <Layout>
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-noch-muted hover:text-white text-sm mb-4 transition-colors">
        <ArrowRight size={16} className="rotate-180 rtl:rotate-0" />
        {lang === 'ar' ? 'رجوع' : 'Back'}
      </button>

      <div className="max-w-2xl mx-auto">
        {/* Task header */}
        <div className={`card mb-4 ${overdue ? 'border-red-500/40' : ''}`}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <PriorityBadge priority={task.priority} />
                <StatusBadge status={task.status} />
                {task.is_group && (
                  <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    <Users size={10} /> {lang === 'ar' ? 'مجموعة' : 'Group'}
                  </span>
                )}
                {overdue && (
                  <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
                    {lang === 'ar' ? 'متأخر' : 'Overdue'}
                  </span>
                )}
              </div>
              <h1 className="text-white font-bold text-xl leading-snug">{task.title}</h1>
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <button onClick={() => setEditing(true)} className="btn-secondary p-2"><Edit size={15} /></button>
                <button onClick={() => setConfirmDelete(true)} className="btn-danger p-2"><Trash2 size={15} /></button>
              </div>
            )}
          </div>

          {task.description && (
            <p className="text-noch-muted text-sm mb-4 leading-relaxed">{task.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <p className="text-noch-muted text-xs mb-0.5">{t('assignTo')}</p>
              <div className="flex flex-wrap gap-2">
                {task.assignees && task.assignees.length > 0 ? (
                  task.assignees.map(a => (
                    <span key={a.id} className="text-white font-medium bg-noch-green/20 px-2 py-1 rounded-full text-xs border border-noch-green/40">
                      {a.assignee?.full_name}
                    </span>
                  ))
                ) : (
                  <p className="text-white font-medium">{task.assignee?.full_name || '—'}</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-noch-muted text-xs mb-0.5">{t('dueDate')}</p>
              <p className={`font-medium ${overdue ? 'text-red-400' : 'text-white'}`}>{formatDueDate(task.due_date, t)}</p>
            </div>
          </div>

          {/* Owner actions */}
          {isOwner && (
            <>
              {/* Send reminder button — show if any assignee has Telegram */}
              {(task.assignees?.some(a => a.assignee?.telegram_chat_id) || task.assignee?.telegram_chat_id) && (
                <div className="flex gap-2 flex-wrap mb-4">
                  <button onClick={sendReminder} className="btn-secondary flex items-center gap-2 text-sm">
                    <Bell size={14} />
                    {lang === 'ar' ? 'إرسال تيليغرام' : 'Send Telegram'}
                  </button>
                </div>
              )}

              {/* Scheduled reminders — owner only, show if primary assignee has Telegram */}
              {task.status !== 'done' && task.assignee?.telegram_chat_id && (
                <ReminderForm
                  taskId={id}
                  telegramChatId={task.assignee.telegram_chat_id}
                  reminders={reminders}
                  onRemindersChange={setReminders}
                />
              )}
            </>
          )}
        </div>

        {/* Status update section */}
        {task.status !== 'done' && (
          <div className="card mb-4">
            <p className="text-noch-muted text-xs mb-3">{lang === 'ar' ? 'تحديث الحالة' : 'Update Status'}</p>

            {/* Show pending approval badge if staff requested completion */}
            {task.pending_status === 'done' && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <span className="text-yellow-400 text-sm">⏳ {lang === 'ar' ? 'طلب إنهاء — بانتظار موافقة المدير' : 'Completion requested — awaiting owner approval'}</span>
              </div>
            )}

            {/* Rejection note from last rejection */}
            {task.approval_note && !task.pending_status && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                <span className="text-red-400 text-xs">↩ {lang === 'ar' ? 'مرفوض: ' : 'Sent back: '}{task.approval_note}</span>
              </div>
            )}

            {/* Owner: Approve/Reject when pending */}
            {isOwner && task.pending_status === 'done' && (
              <div className="flex gap-2 mb-3">
                <button
                  onClick={handleApprove}
                  disabled={updatingStatus}
                  className="flex-1 py-2 rounded-xl font-semibold text-sm bg-noch-green text-noch-dark border border-noch-green hover:bg-green-300 transition-all"
                >
                  ✅ {lang === 'ar' ? 'موافقة' : 'Approve'}
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={updatingStatus}
                  className="flex-1 py-2 rounded-xl font-semibold text-sm border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-all"
                >
                  ↩ {lang === 'ar' ? 'إرجاع' : 'Send Back'}
                </button>
              </div>
            )}

            {/* Status flow buttons */}
            <div className="flex gap-2 flex-wrap">
              {STATUS_FLOW.map((s, i) => {
                const isNext = i === currentStatusIndex + 1
                const isCurrent = i === currentStatusIndex
                if (i <= currentStatusIndex && !isCurrent) return null

                // Staff: replace "Mark Done" with "Request Completion"
                const isRequestDoneBtn = !isOwner && s === 'done'
                const isPendingDone = task.pending_status === 'done'

                return (
                  <button
                    key={s}
                    disabled={updatingStatus || isCurrent || (isRequestDoneBtn && isPendingDone)}
                    onClick={() => isRequestDoneBtn ? handleRequestCompletion() : handleStatusUpdate(s)}
                    className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all border
                      ${isCurrent
                        ? 'border-noch-border text-noch-muted cursor-default'
                        : isNext
                        ? 'bg-noch-green text-noch-dark border-noch-green hover:bg-green-300'
                        : 'border-noch-border text-noch-muted hover:border-noch-green/40'
                      } ${isRequestDoneBtn && isPendingDone ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isCurrent
                      ? STATUS_STATE_LABELS[lang][s]
                      : isRequestDoneBtn
                      ? (isPendingDone ? (lang === 'ar' ? '⏳ طلب مرسل' : '⏳ Requested') : (lang === 'ar' ? '📋 طلب إنهاء' : '📋 Request Done'))
                      : STATUS_ACTION_LABELS[lang][s]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Reject modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-sm">
              <h3 className="text-white font-semibold mb-3">{lang === 'ar' ? 'سبب الإرجاع' : 'Reason for sending back'}</h3>
              <textarea
                className="input w-full mb-3 resize-none"
                rows={3}
                placeholder={lang === 'ar' ? 'اكتب ملاحظة للموظف (اختياري)...' : 'Note for staff (optional)...'}
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowRejectModal(false)} className="btn-secondary flex-1">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                <button onClick={handleReject} className="flex-1 py-2 rounded-xl font-semibold text-sm border border-red-500/50 text-red-400 hover:bg-red-500/10">
                  {lang === 'ar' ? 'إرجاع المهمة' : 'Send Back'}
                </button>
              </div>
            </div>
          </div>
        )}

        {task.status === 'done' && (
          <div className="card mb-4 bg-green-500/5 border-green-500/30 text-center py-4">
            <p className="text-noch-green font-semibold">✓ {lang === 'ar' ? 'تم إكمال هذه المهمة' : 'Task completed'}</p>
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="card mb-4">
            <h3 className="text-white font-semibold mb-3">{t('attachments')}</h3>
            <div className="flex flex-col gap-2">
              {attachments.map(a => (
                <a
                  key={a.id}
                  href={a.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-noch-green hover:text-green-300 transition-colors"
                >
                  <Paperclip size={14} />
                  {a.file_name}
                  <ExternalLink size={12} className="ms-auto text-noch-muted" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="card">
          <TaskComments taskId={id} task={task} />
        </div>
      </div>

      {editing && (
        <TaskForm task={task} onSave={handleEdit} onCancel={() => setEditing(false)} />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={t('confirmDelete')}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Layout>
  )
}
