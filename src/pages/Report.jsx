import { useState, useEffect } from 'react'
import { Send, RefreshCw } from 'lucide-react'
import { getTasks, getTaskStats, getLastReport, logReport } from '../lib/supabase'
import { sendTelegram } from '../lib/telegram'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import StatsBar from '../components/dashboard/StatsBar'
import toast from 'react-hot-toast'

export default function Report() {
  const { t, lang } = useLanguage()
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState([])
  const [lastReport, setLastReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getTaskStats(), getTasks(), getLastReport()])
      .then(([s, t, r]) => { setStats(s); setTasks(t); setLastReport(r) })
      .catch(() => toast.error(t('error')))
      .finally(() => setLoading(false))
  }, [])

  // Build per-staff breakdown
  const staffBreakdown = tasks.reduce((acc, task) => {
    if (!task.assignee) return acc
    const key = task.assignee.id
    if (!acc[key]) acc[key] = { name: task.assignee.full_name, pending: 0, in_progress: 0, done: 0, overdue: 0 }
    acc[key][task.status]++
    const today = new Date().toISOString().split('T')[0]
    if (task.status !== 'done' && task.due_date && task.due_date < today) acc[key].overdue++
    return acc
  }, {})

  const buildReportMessage = () => {
    const date = new Date().toLocaleDateString('ar-LY', { weekday: 'long', day: 'numeric', month: 'long' })
    let msg = `📊 *تقرير نوخ الأسبوعي*\n${date}\n\n`
    msg += `✅ مكتمل: ${stats?.done || 0}\n`
    msg += `🔄 جاري: ${stats?.in_progress || 0}\n`
    msg += `⏳ انتظار: ${stats?.pending || 0}\n`
    msg += `🔴 متأخر: ${stats?.overdue || 0}\n\n`
    Object.values(staffBreakdown).forEach(s => {
      msg += `👤 *${s.name}*: ✅${s.done} 🔄${s.in_progress} ⏳${s.pending}${s.overdue > 0 ? ` 🔴${s.overdue}` : ''}\n`
    })
    msg += `\n— فريق بلوم - نوتش ☕`
    return msg
  }

  const sendReport = async () => {
    const message = buildReportMessage()
    const chatId = profile?.telegram_chat_id
    if (!chatId) return toast.error('لا يوجد حساب تيليغرام في ملفك الشخصي')
    try {
      await sendTelegram(chatId, message)
      await logReport(String(chatId), stats)
      setLastReport({ sent_at: new Date().toISOString() })
      toast.success(t('reportSent'))
    } catch (err) {
      toast.error(err.message || t('error'))
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">{t('weeklyReport')}</h1>
          {lastReport && (
            <p className="text-noch-muted text-xs mt-0.5">
              {lang === 'ar' ? 'آخر تقرير:' : 'Last report:'} {new Date(lastReport.sent_at).toLocaleDateString(lang === 'ar' ? 'ar-LY' : 'en-GB')}
            </p>
          )}
        </div>
        <button onClick={sendReport} className="btn-primary flex items-center gap-2">
          <Send size={16} />
          {t('sendReport')}
        </button>
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-16">{t('loading')}</p>
      ) : (
        <>
          <StatsBar stats={stats} />

          {/* Per-staff breakdown */}
          <div className="card">
            <h2 className="text-white font-semibold mb-4">{lang === 'ar' ? 'تفصيل حسب الموظف' : 'Per Staff Breakdown'}</h2>
            {Object.keys(staffBreakdown).length === 0 ? (
              <p className="text-noch-muted text-sm">{lang === 'ar' ? 'لا توجد مهام مسندة' : 'No assigned tasks'}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.values(staffBreakdown).map((s, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-noch-border last:border-0">
                    <div className="w-8 h-8 rounded-full bg-noch-green/10 border border-noch-green/20 flex items-center justify-center text-noch-green font-bold text-sm flex-shrink-0">
                      {s.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{s.name}</p>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-400">✅ {s.done}</span>
                      <span className="text-blue-400">🔄 {s.in_progress}</span>
                      <span className="text-yellow-400">⏳ {s.pending}</span>
                      {s.overdue > 0 && <span className="text-red-400">🔴 {s.overdue}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  )
}
