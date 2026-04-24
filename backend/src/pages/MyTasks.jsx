import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, CheckCircle } from 'lucide-react'
import { getMyTasks, updateTask, formatDueDate, isOverdue } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import Layout from '../components/Layout'
import PriorityBadge from '../components/shared/PriorityBadge'
import EmptyState from '../components/shared/EmptyState'
import toast from 'react-hot-toast'

const STATUS_BTN_LABELS = {
  ar: { pending: '▶ بدأت', in_progress: '🔄 شغّال عليها', done: '✓ خلّصت' },
  en: { pending: '▶ Started', in_progress: '🔄 In Progress', done: '✓ Done' },
}

const NEXT_STATUS = { pending: 'in_progress', in_progress: 'done' }

export default function MyTasks() {
  const { user, profile } = useAuth()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    if (user) {
      getMyTasks(user.id)
        .then(setTasks)
        .catch(() => toast.error(t('error')))
        .finally(() => setLoading(false))
    }
  }, [user])

  const handleStatus = async (task, e) => {
    e.stopPropagation()
    const next = NEXT_STATUS[task.status]
    if (!next) return
    setUpdating(task.id)
    try {
      const updated = await updateTask(task.id, { status: next })
      if (next === 'done') {
        setTasks(prev => prev.filter(t => t.id !== task.id))
      } else {
        setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
      }
      toast.success(t('statusUpdated'))
    } catch {
      toast.error(t('error'))
    } finally {
      setUpdating(null)
    }
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-white font-bold text-xl">{t('myTasks')}</h1>
        {profile?.full_name && (
          <p className="text-noch-muted text-sm">{lang === 'ar' ? `أهلاً ${profile.full_name}` : `Welcome, ${profile.full_name}`}</p>
        )}
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-16">{t('loading')}</p>
      ) : tasks.length === 0 ? (
        <EmptyState icon="🎉" title={t('noMyTasks')} />
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map(task => {
            const overdue = isOverdue(task)
            const nextStatus = NEXT_STATUS[task.status]

            return (
              <div
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}`)}
                className={`card cursor-pointer active:scale-[0.99] transition-all
                  ${overdue ? 'border-red-500/40' : 'hover:border-noch-green/30'}`}
              >
                <div className="flex items-start gap-3">
                  {/* Priority indicator */}
                  <div className={`w-1 rounded-full self-stretch flex-shrink-0
                    ${task.priority === 'urgent' ? 'bg-red-500'
                    : task.priority === 'high' ? 'bg-orange-500'
                    : task.priority === 'medium' ? 'bg-yellow-500'
                    : 'bg-zinc-600'}`}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <PriorityBadge priority={task.priority} />
                      {overdue && (
                        <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
                          {lang === 'ar' ? 'متأخر' : 'Overdue'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-white font-semibold leading-snug mb-1">{task.title}</h3>
                    {task.description && (
                      <p className="text-noch-muted text-sm line-clamp-2 mb-2">{task.description}</p>
                    )}
                    <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-400' : 'text-noch-muted'}`}>
                      <Calendar size={11} />
                      {formatDueDate(task.due_date, t)}
                    </span>
                  </div>
                </div>

                {/* Status buttons — large tap targets */}
                {nextStatus && (
                  <div className="mt-4 flex gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      disabled={updating === task.id}
                      onClick={(e) => handleStatus(task, e)}
                      className="flex-1 py-3 rounded-xl font-semibold text-sm bg-noch-green text-noch-dark hover:bg-green-300 transition-colors"
                    >
                      {updating === task.id ? '...' : STATUS_BTN_LABELS[lang][task.status]}
                    </button>
                    {task.status === 'in_progress' && (
                      <button
                        disabled={updating === task.id}
                        onClick={async (e) => {
                          e.stopPropagation()
                          setUpdating(task.id)
                          try {
                            await updateTask(task.id, { status: 'done' })
                            setTasks(prev => prev.filter(t => t.id !== task.id))
                            toast.success(t('statusUpdated'))
                          } catch {
                            toast.error(t('error'))
                          } finally {
                            setUpdating(null)
                          }
                        }}
                        className="flex-1 py-3 rounded-xl font-semibold text-sm bg-noch-green text-noch-dark hover:bg-green-300 transition-colors"
                      >
                        {STATUS_BTN_LABELS[lang]['done']}
                      </button>
                    )}
                  </div>
                )}

                {task.status === 'done' && (
                  <div className="mt-3 flex items-center gap-2 text-noch-green text-sm">
                    <CheckCircle size={14} />
                    {lang === 'ar' ? 'مكتمل' : 'Done'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
