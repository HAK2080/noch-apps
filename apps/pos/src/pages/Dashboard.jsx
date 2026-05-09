import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock, Package, ShoppingBag, RefreshCw, Plus, ChevronRight, UserCheck, X, Zap } from 'lucide-react'
import { getDashboardAlerts, getTaskStats, getPendingApprovals, createTask, assignStaffToTask, uploadAttachment, getStaffProfiles, supabase } from '../lib/supabase'
import { listSuggestedActions, runAllEventProducers } from '../lib/businessEvents'
import { sendTelegram } from '../lib/telegram'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import StatsBar from '../components/dashboard/StatsBar'
import TaskForm from '../components/tasks/TaskForm'
import ActionCard from '../components/intelligence/ActionCard'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { t, lang } = useLanguage()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState({ overdueTasks: [], urgentTasks: [], lowStockItems: [], pendingOrders: [], pendingApprovals: [] })
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [accessRequests, setAccessRequests] = useState([])
  const [busyRequestId, setBusyRequestId] = useState(null)
  const [foundersClub, setFoundersClub] = useState(null)
  const [suggestedActions, setSuggestedActions] = useState([])

  const isOwner = profile?.role === 'owner'

  const loadAccessRequests = useCallback(async () => {
    if (!isOwner) return
    const { data } = await supabase
      .from('staff_access_requests')
      .select('id, full_name, email, phone, note, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setAccessRequests(data || [])
  }, [isOwner])

  const loadFoundersClub = useCallback(async () => {
    if (!isOwner) return
    const { data } = await supabase.from('founders_club_status').select('*').single()
    setFoundersClub(data || null)
  }, [isOwner])

  const loadSuggestedActions = useCallback(async () => {
    if (!isOwner) return
    try {
      // Run event producers (idempotent — they only insert if a matching open event isn't there yet)
      await runAllEventProducers()
      const actions = await listSuggestedActions({ status: 'pending' })
      setSuggestedActions(actions || [])
    } catch (e) {
      // Non-fatal — Command Center is additive, never block the dashboard
      console.warn('listSuggestedActions failed:', e?.message || e)
    }
  }, [isOwner])

  const approveAccess = async (req) => {
    setBusyRequestId(req.id)
    try {
      const { data, error } = await supabase.functions.invoke('approve-staff-request', {
        body: {
          request_id: req.id,
          profile: { full_name: req.full_name, phone: req.phone || null },
          redirectTo: `${window.location.origin}/login`,
        },
      })
      if (error || data?.error) {
        let msg = data?.error || error?.message
        try { const b = await error?.context?.json(); msg = b?.error || msg } catch {}
        throw new Error(msg)
      }
      setAccessRequests(prev => prev.filter(r => r.id !== req.id))
      toast.success(`${req.full_name} approved — invite sent`)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusyRequestId(null)
    }
  }

  const rejectAccess = async (req) => {
    setBusyRequestId(req.id)
    try {
      const { error } = await supabase
        .from('staff_access_requests')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      setAccessRequests(prev => prev.filter(r => r.id !== req.id))
      toast.success('Rejected')
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusyRequestId(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, s, pendingApprovals] = await Promise.all([getDashboardAlerts(), getTaskStats(), getPendingApprovals()])
      setAlerts({ ...a, pendingApprovals })
      setStats(s)
    } catch {
      toast.error(t('error'))
    } finally {
      setLoading(false)
    }
    loadAccessRequests()
    loadFoundersClub()
    loadSuggestedActions()
  }, [loadAccessRequests, loadFoundersClub, loadSuggestedActions])

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
          // Use assigneeIds directly — task.assignees is empty at creation time (assignments added after)
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
              // Notify admin/owner that messages were sent
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

  const totalAlerts = alerts.overdueTasks.length + alerts.urgentTasks.length +
    alerts.lowStockItems.length + alerts.pendingOrders.length + (alerts.pendingApprovals?.length || 0)

  const priorityColor = { urgent: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-noch-green' }
  const priorityBg = { urgent: 'bg-red-500/10 border-red-500/30', high: 'bg-orange-500/10 border-orange-500/30', medium: 'bg-yellow-500/10 border-yellow-500/30', low: 'bg-green-500/10 border-green-500/30' }

  const l = {
    ar: {
      title: 'لوحة التحكم',
      attention: 'يحتاج انتباهك',
      allClear: 'لا يوجد شيء يحتاج انتباهك الآن',
      allClearHint: 'كل المهام في وقتها والمخزون كافٍ',
      overdue: 'مهام متأخرة',
      urgent: 'مهام عاجلة',
      lowStock: 'مخزون منخفض',
      pendingOrders: 'طلبات أونلاين',
      viewAll: 'عرض الكل',
      dueDate: 'الموعد',
      stock: 'المخزون',
      needed: 'الحد الأدنى',
      payment: 'الدفع',
      total: 'الإجمالي',
      newTask: 'مهمة جديدة',
      refresh: 'تحديث',
      items: 'عنصر',
    },
    en: {
      title: 'Dashboard',
      attention: 'Needs Your Attention',
      allClear: 'All clear — nothing needs your attention',
      allClearHint: 'All tasks are on track and stock levels are fine',
      overdue: 'Overdue Tasks',
      urgent: 'Urgent Tasks',
      lowStock: 'Low Stock',
      pendingOrders: 'Online Orders',
      viewAll: 'View All',
      dueDate: 'Due',
      stock: 'In Stock',
      needed: 'Min',
      payment: 'Payment',
      total: 'Total',
      newTask: 'New Task',
      refresh: 'Refresh',
      items: 'items',
    }
  }[lang]

  const paymentLabel = { pickup: lang === 'ar' ? 'استلام' : 'Pickup', bank_transfer: lang === 'ar' ? 'تحويل' : 'Transfer', cod: lang === 'ar' ? 'عند الاستلام' : 'COD' }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">{l.title}</h1>
          <p className="text-noch-muted text-sm">
            {new Date().toLocaleDateString(lang === 'ar' ? 'ar-LY' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary p-2.5" title={l.refresh}><RefreshCw size={16} /></button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span className="hidden sm:inline">{l.newTask}</span>
          </button>
        </div>
      </div>

      {/* Pending access requests — owner only, top priority */}
      {isOwner && accessRequests.length > 0 && (
        <div className="card mb-4 border-noch-green/40 bg-noch-green/5">
          <div className="flex items-center gap-2 mb-3 text-noch-green">
            <UserCheck size={16} />
            <h2 className="font-semibold text-sm uppercase tracking-wide">
              Access requests ({accessRequests.length})
            </h2>
          </div>
          <div className="space-y-2">
            {accessRequests.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-noch-border bg-noch-dark">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{r.full_name}</p>
                  <p className="text-noch-muted text-xs truncate">
                    {r.email}{r.phone ? ` · ${r.phone}` : ''}
                  </p>
                  {r.note && <p className="text-noch-muted text-xs italic truncate mt-0.5">{r.note}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => approveAccess(r)}
                    disabled={busyRequestId === r.id}
                    className="text-xs bg-noch-green/15 border border-noch-green/40 text-noch-green px-3 py-1.5 rounded-lg hover:bg-noch-green/25 transition-colors disabled:opacity-50"
                  >
                    {busyRequestId === r.id ? '...' : '✓ Approve'}
                  </button>
                  <button
                    onClick={() => rejectAccess(r)}
                    disabled={busyRequestId === r.id}
                    className="text-xs bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    title="Reject"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-noch-muted text-[11px] mt-3">
            Approve sends an invite email so they can set their own password. Edit role/branch later in Staff.
          </p>
        </div>
      )}

      {/* Founders Club counter — owner only, scarcity reminder */}
      {isOwner && foundersClub && (
        <div className="card mb-4 border-purple-400/30 bg-gradient-to-r from-purple-400/5 to-pink-400/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-purple-300 text-xs font-bold tracking-widest uppercase mb-1">🏛 Noch Founders Club</p>
              <p className="text-white text-sm">
                <span className="font-bold text-2xl text-purple-300">{foundersClub.filled}</span>
                <span className="text-noch-muted"> / {foundersClub.total} seats taken</span>
              </p>
              <p className="text-noch-muted text-xs mt-1">
                {foundersClub.seats_left > 0
                  ? `${foundersClub.seats_left} founder seats remain. Closes forever once full.`
                  : 'The Founders Club is closed. No new founders, ever.'}
              </p>
            </div>
            <div className="text-3xl">🏛</div>
          </div>
        </div>
      )}

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Command Center — Suggested Actions (Phase 2) */}
      {isOwner && suggestedActions.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3 text-yellow-300">
            <Zap size={16} />
            <h2 className="font-semibold text-sm uppercase tracking-wide">
              {lang === 'ar' ? 'إجراءات مقترحة' : 'Suggested Actions'}
            </h2>
            <span className="text-noch-muted text-xs">({suggestedActions.length})</span>
          </div>
          <div className="space-y-3">
            {suggestedActions.map(a => (
              <ActionCard key={a.id} action={a} onAction={loadSuggestedActions} />
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <p className="text-noch-muted text-center py-12">{t('loading')}</p>
      ) : totalAlerts === 0 ? (
        /* All clear state */
        <div className="card text-center py-14">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-white font-semibold text-lg">{l.allClear}</p>
          <p className="text-noch-muted text-sm mt-2">{l.allClearHint}</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Overdue Tasks */}
          {alerts.overdueTasks.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-red-400">
                  <Clock size={16} />
                  <h2 className="font-semibold text-sm uppercase tracking-wide">{l.overdue} ({alerts.overdueTasks.length})</h2>
                </div>
                <button onClick={() => navigate('/tasks')} className="text-noch-muted hover:text-white text-xs flex items-center gap-1">
                  {l.viewAll} <ChevronRight size={12} />
                </button>
              </div>
              <div className="space-y-2">
                {alerts.overdueTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="card border border-red-500/30 bg-red-500/5 flex items-center justify-between cursor-pointer hover:border-red-400/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{task.title}</p>
                      <p className="text-red-400 text-xs mt-0.5">{l.dueDate}: {task.due_date}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ml-3 ${priorityBg[task.priority] || 'bg-noch-card border-noch-border'} ${priorityColor[task.priority] || 'text-noch-muted'}`}>
                      {task.priority}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Urgent Tasks */}
          {alerts.urgentTasks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 text-orange-400">
                <AlertTriangle size={16} />
                <h2 className="font-semibold text-sm uppercase tracking-wide">{l.urgent} ({alerts.urgentTasks.length})</h2>
              </div>
              <div className="space-y-2">
                {alerts.urgentTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="card border border-orange-500/30 bg-orange-500/5 flex items-center justify-between cursor-pointer hover:border-orange-400/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{task.title}</p>
                      <p className="text-noch-muted text-xs mt-0.5 capitalize">{task.status?.replace('_', ' ')}</p>
                    </div>
                    {task.due_date && (
                      <span className="text-orange-400 text-xs shrink-0 ml-3">{l.dueDate}: {task.due_date}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pending Approvals */}
          {alerts.pendingApprovals?.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 text-yellow-400">
                <CheckCircle size={16} />
                <h2 className="font-semibold text-sm uppercase tracking-wide">Pending Approvals ({alerts.pendingApprovals.length})</h2>
              </div>
              <div className="space-y-2">
                {alerts.pendingApprovals.map(task => (
                  <div key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}
                    className="card border border-yellow-500/30 bg-yellow-500/5 flex items-center justify-between cursor-pointer hover:border-yellow-400/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{task.title}</p>
                      <p className="text-yellow-400 text-xs mt-0.5">
                        {task.assignees?.[0]?.assignee?.full_name || task.assignee?.full_name || ''} {lang === 'ar' ? 'طلب الإنهاء' : 'requested completion'}
                      </p>
                    </div>
                    <span className="text-yellow-400 text-xs shrink-0 ml-3">⏳</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Low Stock */}
          {alerts.lowStockItems.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-yellow-400">
                  <Package size={16} />
                  <h2 className="font-semibold text-sm uppercase tracking-wide">{l.lowStock} ({alerts.lowStockItems.length})</h2>
                </div>
                <button onClick={() => navigate('/inventory/stock')} className="text-noch-muted hover:text-white text-xs flex items-center gap-1">
                  {l.viewAll} <ChevronRight size={12} />
                </button>
              </div>
              <div className="space-y-2">
                {alerts.lowStockItems.slice(0, 8).map(item => (
                  <div key={item.id} className="card border border-yellow-500/30 bg-yellow-500/5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {lang === 'ar' && item.ingredient?.name_ar ? item.ingredient.name_ar : item.ingredient?.name}
                      </p>
                      <p className="text-noch-muted text-xs mt-0.5 capitalize">{item.ingredient?.category}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-yellow-400 text-sm font-semibold">{item.qty_available} {item.unit}</p>
                      <p className="text-noch-muted text-xs">{l.needed}: {item.min_threshold}</p>
                    </div>
                  </div>
                ))}
                {alerts.lowStockItems.length > 8 && (
                  <p className="text-noch-muted text-xs text-center pt-1">+{alerts.lowStockItems.length - 8} {l.items}</p>
                )}
              </div>
            </section>
          )}

          {/* Pending Online Orders */}
          {alerts.pendingOrders.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-blue-400">
                  <ShoppingBag size={16} />
                  <h2 className="font-semibold text-sm uppercase tracking-wide">{l.pendingOrders} ({alerts.pendingOrders.length})</h2>
                </div>
                <button onClick={() => navigate('/pos')} className="text-noch-muted hover:text-white text-xs flex items-center gap-1">
                  {l.viewAll} <ChevronRight size={12} />
                </button>
              </div>
              <div className="space-y-2">
                {alerts.pendingOrders.map(order => (
                  <div key={order.id} className="card border border-blue-500/30 bg-blue-500/5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium">{order.customer_name}</p>
                      <p className="text-noch-muted text-xs mt-0.5">{order.order_number} · {order.branch?.name}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-blue-400 text-sm font-semibold">{order.total?.toFixed(2)} LYD</p>
                      <p className="text-noch-muted text-xs">{paymentLabel[order.payment_method] || order.payment_method}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      {showForm && (
        <TaskForm onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}
    </Layout>
  )
}
