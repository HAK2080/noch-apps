import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Package,
  Receipt,
  RefreshCw,
  Send,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { getTasks, getTaskStats, getLastReport, logReport } from '../lib/tasks'
import { localYmd } from '../lib/businessDay'
import { getManagementReport } from '../modules/reports/lib/management-report'
import { sendTelegram } from '../lib/telegram'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import toast from 'react-hot-toast'

const periods = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
]

const insightStyle = {
  good: 'border-noch-green/30 bg-noch-green/10 text-noch-green',
  warn: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300',
  risk: 'border-red-400/30 bg-red-400/10 text-red-300',
}

const fmtLyd = (value) => `${Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })} LYD`
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-GB') : '-'

function MetricCard({ icon, label, value, sub, tone = 'text-white' }) {
  const MetricIcon = icon
  return (
    <div className="card !p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-noch-muted text-[11px] uppercase tracking-wider">{label}</p>
          <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
          {sub && <p className="text-noch-muted text-xs mt-1">{sub}</p>}
        </div>
        <MetricIcon size={18} className={tone} />
      </div>
    </div>
  )
}

function Section({ title, children, action }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-white font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }) {
  return <p className="text-noch-muted text-sm py-2">{text}</p>
}

function PeriodBadge({ children }) {
  return (
    <span className="text-[11px] px-2 py-1 rounded border border-noch-border text-noch-muted">
      {children}
    </span>
  )
}

export default function Report() {
  const { t, lang } = useLanguage()
  const { profile } = useAuth()
  const [periodDays, setPeriodDays] = useState(7)
  const [branchId, setBranchId] = useState('')
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState([])
  const [report, setReport] = useState(null)
  const [lastReport, setLastReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (days = periodDays) => {
    setRefreshing(true)
    try {
      const [taskStats, allTasks, lastSent, managementReport] = await Promise.all([
        getTaskStats(),
        getTasks(),
        getLastReport(),
        getManagementReport({ days, branchId: branchId || null }),
      ])
      setStats(taskStats)
      setTasks(allTasks)
      setLastReport(lastSent)
      setReport(managementReport)
    } catch (err) {
      toast.error(err.message || t('error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load(periodDays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays, branchId])

  const staffBreakdown = useMemo(() => tasks.reduce((acc, task) => {
    const assignee = task.assignee || task.assignees?.[0]?.assignee
    if (!assignee) return acc
    const key = assignee.id
    if (!acc[key]) acc[key] = { name: assignee.full_name || 'Staff', pending: 0, in_progress: 0, done: 0, overdue: 0 }
    acc[key][task.status] = (acc[key][task.status] || 0) + 1
    const today = localYmd()
    if (task.status !== 'done' && task.due_date && task.due_date < today) acc[key].overdue += 1
    return acc
  }, {}), [tasks])

  const buildReportMessage = () => {
    const m = report?.metrics || {}
    const lines = [
      `Noch management report (${report?.period?.from} to ${report?.period?.to})`,
      `Scope: ${report?.scope?.branchName || 'All branches'}`,
      `Net sales: ${fmtLyd(m.revenue)} from ${m.orders || 0} orders`,
      m.revenueAdjustments < 0 ? `Adjustments/refunds: ${fmtLyd(Math.abs(m.revenueAdjustments))}` : null,
      `Average ticket: ${fmtLyd(m.averageTicket)}`,
      `Operating expenses: ${fmtLyd(m.operatingExpenses)}`,
      `CapEx/prepaid excluded from net: ${fmtLyd((m.capitalExpenses || 0) + (m.prepaidExpenses || 0))}`,
      `Net after operating expenses: ${fmtLyd(m.netAfterExpenses)}`,
      `Low stock: ${m.lowStockCount || 0} items`,
      `WhatsApp failures: ${m.whatsappFailed || 0}`,
      `Tasks: ${stats?.pending || 0} pending, ${stats?.overdue || 0} overdue`,
    ].filter(Boolean)
    report?.insights?.slice(0, 4).forEach(item => lines.push(`- ${item.title}: ${item.detail}`))
    return lines.join('\n')
  }

  const sendReport = async () => {
    const chatId = profile?.telegram_chat_id
    if (!chatId) return toast.error('No Telegram chat ID is set on your profile')
    try {
      await sendTelegram(chatId, buildReportMessage())
      await logReport(String(chatId), { metrics: report?.metrics, tasks: stats })
      setLastReport({ sent_at: new Date().toISOString() })
      toast.success(t('reportSent'))
    } catch (err) {
      toast.error(err.message || t('error'))
    }
  }

  const m = report?.metrics || {}
  const trendTone = m.revenueChangePct == null ? 'text-noch-muted' : m.revenueChangePct >= 0 ? 'text-noch-green' : 'text-red-400'
  const TrendIcon = m.revenueChangePct == null || m.revenueChangePct >= 0 ? TrendingUp : TrendingDown
  const selectedPeriodLabel = periods.find(period => period.days === periodDays)?.label || `${periodDays} days`
  const salesSub = `${m.orders || 0} orders${m.revenueAdjustments < 0 ? ` · ${fmtLyd(Math.abs(m.revenueAdjustments))} adjustments` : ''}`

  return (
    <Layout>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-white font-bold text-xl">Management Report</h1>
          <p className="text-noch-muted text-sm mt-1">
            {report ? `${selectedPeriodLabel}: ${fmtDate(report.period.from)} - ${fmtDate(report.period.to)}` : 'Sales, costs, stock, loyalty, messaging, and execution'}
          </p>
          {lastReport && (
            <p className="text-noch-muted text-xs mt-1">
              Last sent: {new Date(lastReport.sent_at).toLocaleString(lang === 'ar' ? 'ar-LY' : 'en-GB')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="input py-2 text-sm">
            <option value="">All branches</option>
            {report?.branches?.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <div className="flex rounded-lg border border-noch-border bg-noch-card p-1">
            {periods.map(period => (
              <button
                key={period.days}
                onClick={() => setPeriodDays(period.days)}
                className={`px-3 py-1.5 rounded-md text-sm ${periodDays === period.days ? 'bg-noch-green text-black font-semibold' : 'text-noch-muted hover:text-white'}`}
              >
                {period.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(periodDays)} className="btn-secondary flex items-center gap-2" disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={sendReport} className="btn-primary flex items-center gap-2">
            <Send size={16} />
            {t('sendReport')}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-16">{t('loading')}</p>
      ) : (
        <div className="space-y-5">
          <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${refreshing ? 'opacity-60' : ''}`}>
            <MetricCard icon={ShoppingBag} label={`Net Sales (${selectedPeriodLabel})`} value={fmtLyd(m.revenue)} sub={salesSub} tone="text-noch-green" />
            <MetricCard icon={TrendIcon} label="Sales Trend" value={m.revenueChangePct == null ? 'No prior period' : `${m.revenueChangePct.toFixed(1)}%`} sub="vs previous period" tone={trendTone} />
            <MetricCard icon={Receipt} label={`Operating expenses (${selectedPeriodLabel})`} value={fmtLyd(m.operatingExpenses)} sub={`${fmtLyd((m.capitalExpenses || 0) + (m.prepaidExpenses || 0))} CapEx/prepaid excluded`} tone="text-yellow-300" />
            <MetricCard icon={CheckCircle2} label="Net After Operating Expenses" value={fmtLyd(m.netAfterExpenses)} sub={`${report?.scope?.branchName || 'All branches'} · Avg ticket ${fmtLyd(m.averageTicket)}`} tone={m.netAfterExpenses >= 0 ? 'text-white' : 'text-red-400'} />
          </div>

          <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${refreshing ? 'opacity-60' : ''}`}>
            <MetricCard icon={Package} label="Stock Risk (live)" value={`${m.lowStockCount || 0}`} sub={`${m.outOfStockCount || 0} out of stock`} tone={m.lowStockCount ? 'text-red-400' : 'text-noch-green'} />
            <MetricCard icon={Users} label={`Loyalty (${selectedPeriodLabel})`} value={`${m.loyaltyActive || 0}`} sub={`${m.newCustomers || 0} new, ${m.loyaltyCustomers || 0} total`} tone="text-blue-300" />
            <MetricCard icon={MessageSquare} label={`WhatsApp (${selectedPeriodLabel})`} value={`${m.whatsappSent || 0}`} sub={`${m.whatsappFailed || 0} failed, ${m.whatsappQueued || 0} queued/sent`} tone={m.whatsappFailed ? 'text-red-400' : 'text-noch-green'} />
            <MetricCard icon={Clock} label="Tasks (live)" value={`${stats?.pending || 0} pending`} sub={`${stats?.overdue || 0} overdue, ${stats?.done || 0} done`} tone={stats?.overdue ? 'text-red-400' : 'text-white'} />
          </div>

          <Section title="Management Attention" action={<PeriodBadge>{selectedPeriodLabel}</PeriodBadge>}>
            <div className="grid gap-3 lg:grid-cols-2">
              {report?.insights?.map((item, index) => (
                <div key={index} className={`rounded-lg border px-3 py-3 ${insightStyle[item.type] || insightStyle.warn}`}>
                  <div className="flex items-start gap-2">
                    {item.type === 'good' ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs opacity-90 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Stock Risks" action={<PeriodBadge>Live</PeriodBadge>}>
              {!report?.stockRisk?.length ? (
                <Empty text="No stock items below minimum." />
              ) : (
                <div className="space-y-2">
                  {report.stockRisk.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 border-b border-noch-border pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="text-white text-sm">{item.ingredient?.name || item.ingredient?.name_ar || 'Stock item'}</p>
                        <p className="text-noch-muted text-xs">Minimum {Number(item.min_threshold || 0).toLocaleString('en-GB')} {item.unit || ''}</p>
                      </div>
                      <p className="text-red-300 text-sm font-mono">{Number(item.qty_available || 0).toLocaleString('en-GB')} {item.unit || ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Expense Pressure" action={<PeriodBadge>{selectedPeriodLabel}</PeriodBadge>}>
              {!report?.expenses?.length ? (
                <Empty text="No expenses recorded in this period." />
              ) : (
                <div className="space-y-2">
                  {report.expenses.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 border-b border-noch-border pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="text-white text-sm">{item.vendor || item.description || 'Expense'}</p>
                        <p className="text-noch-muted text-xs">{fmtDate(item.expense_date)} · {item.status || 'submitted'}</p>
                      </div>
                      <p className="text-yellow-300 text-sm font-mono">{fmtLyd(item.amount_lyd ?? (Number(item.amount || 0) * Number(item.exchange_rate_to_lyd || 1)))}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Staff Execution" action={<PeriodBadge>Live</PeriodBadge>}>
              {Object.keys(staffBreakdown).length === 0 ? (
                <Empty text="No assigned tasks." />
              ) : (
                <div className="space-y-2">
                  {Object.values(staffBreakdown).map((staff, index) => (
                    <div key={index} className="flex items-center gap-3 border-b border-noch-border py-2 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-noch-green/10 border border-noch-green/20 flex items-center justify-center text-noch-green font-bold text-sm flex-shrink-0">
                        {staff.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{staff.name}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-3 text-xs">
                        <span className="text-green-400">Done {staff.done}</span>
                        <span className="text-blue-400">Doing {staff.in_progress}</span>
                        <span className="text-yellow-400">Pending {staff.pending}</span>
                        {staff.overdue > 0 && <span className="text-red-400">Overdue {staff.overdue}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="WhatsApp Health" action={<PeriodBadge>{selectedPeriodLabel}</PeriodBadge>}>
              {!report?.whatsapp?.length ? (
                <Empty text="No WhatsApp sends in this period." />
              ) : (
                <div className="space-y-2">
                  {report.whatsapp.map(item => {
                    const status = item.provider_status || item.status || 'unknown'
                    const risky = ['failed', 'undelivered', 'error', 'cooldown_recent_send', 'not_opted_in', 'missing_template_sid'].includes(String(status).toLowerCase())
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b border-noch-border pb-2 last:border-0 last:pb-0">
                        <div>
                          <p className="text-white text-sm">{item.template_key || 'WhatsApp message'}</p>
                          <p className="text-noch-muted text-xs">{new Date(item.created_at).toLocaleString('en-GB')}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded border ${risky ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'border-noch-green/30 bg-noch-green/10 text-noch-green'}`}>
                          {status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </Layout>
  )
}
