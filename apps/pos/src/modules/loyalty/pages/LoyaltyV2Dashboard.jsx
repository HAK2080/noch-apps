import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Gift,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../../components/Layout'
import { useLanguage } from '../../../contexts/LanguageContext'
import { getLoyaltyV2OwnerSummary } from '../lib/loyalty-supabase'

const formatPct = value => value == null ? '—' : `${Number(value).toFixed(2)}%`
const formatNumber = value => new Intl.NumberFormat('en').format(Number(value || 0))

function Metric({ label, value, hint, warning = false }) {
  return (
    <div className={`rounded-xl border p-4 ${warning ? 'border-orange-300/30 bg-orange-300/5' : 'border-noch-border bg-noch-card'}`}>
      <p className="text-xs text-noch-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warning ? 'text-orange-200' : 'text-white'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-noch-muted">{hint}</p>}
    </div>
  )
}

export default function LoyaltyV2Dashboard() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setSummary(await getLoyaltyV2OwnerSummary())
    } catch (loadError) {
      setError(loadError.message || 'Could not load loyalty control')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const launch = summary?.launch || {}
  const capture = summary?.capture || {}
  const consent = summary?.consent || {}
  const rewards = summary?.rewards || {}
  const members = summary?.members || {}
  const belowTarget = launch.status === 'below_target'

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{ar ? 'الولاء والعملاء' : 'Loyalty & customers'}</h1>
            <span className="rounded-full border border-noch-green/30 bg-noch-green/10 px-2 py-0.5 text-xs text-noch-green">
              {ar ? 'الإصدار 2 نشط' : 'V2 active'}
            </span>
          </div>
          <p className="mt-1 text-sm text-noch-muted">
            {ar ? 'قياس الالتقاط بعد الإطلاق، الخصوصية، الموافقات، والنقاط والمكافآت' : 'Post-launch capture, privacy, consent, points, and reward obligations'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => navigate('/loyalty/customers')}>
            <Users size={16} className="me-2 inline" />{ar ? 'العملاء' : 'Customers'}
          </button>
          <button className="btn-secondary" onClick={() => navigate('/loyalty/missions')}>
            <Target size={16} className="me-2 inline" />{ar ? 'المهمات' : 'Missions'}
          </button>
          <button className="btn-secondary" onClick={() => navigate('/loyalty/archive-v1')}>
            <Archive size={16} className="me-2 inline" />{ar ? 'أرشيف V1' : 'V1 archive'}
          </button>
          <button className="btn-secondary p-2.5" onClick={load} aria-label={ar ? 'تحديث' : 'Refresh'}><RefreshCw size={16} /></button>
        </div>
      </header>

      {loading ? (
        <p className="py-16 text-center text-noch-muted">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : error ? (
        <div className="card border-red-400/30 text-red-300">{error}</div>
      ) : (
        <div className="space-y-6">
          <section className={`rounded-2xl border p-5 ${belowTarget ? 'border-orange-300/40 bg-orange-300/5' : 'border-noch-green/30 bg-noch-green/5'}`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                {belowTarget ? <AlertTriangle className="text-orange-300" /> : <CheckCircle2 className="text-noch-green" />}
                <div>
                  <h2 className="font-semibold text-white">{ar ? 'صحة الالتقاط منذ إطلاق V2' : 'V2 launch capture health'}</h2>
                  <p className="text-xs text-noch-muted">
                    {ar ? 'لا نخلط بيانات ما قبل الإطلاق مع هدف 30/90 يوماً.' : 'Pre-launch history is never mixed into the 30/90-day target.'}
                  </p>
                </div>
              </div>
              <span className="text-xs text-noch-muted">
                {ar ? `${launch.days_live || 0} يوم منذ الإطلاق` : `${launch.days_live || 0} days live`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label={ar ? 'الطلبات المؤهلة' : 'Eligible orders'} value={formatNumber(launch.eligible_orders)} />
              <Metric label={ar ? 'الطلبات المرتبطة' : 'Linked orders'} value={formatNumber(launch.linked_orders)} />
              <Metric label={ar ? 'معدل الربط' : 'Link rate'} value={formatPct(launch.link_rate_pct)} warning={belowTarget} />
              <Metric
                label={ar ? 'الهدف' : 'Target'}
                value="30% → 50%"
                hint={ar ? 'اليوم 30 ← اليوم 90' : 'day 30 → day 90'}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-semibold text-white">{ar ? 'جودة القرار والبيانات' : 'Decision and data quality'}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label={ar ? 'قرارات موثقة' : 'Resolved decisions'} value={formatNumber(capture.resolved)} />
              <Metric label={ar ? 'تحتاج تسوية' : 'Needs reconciliation'} value={formatNumber(capture.unknown)} warning={Number(capture.unknown) > 0} />
              <Metric label={ar ? 'استثناءات الهوية' : 'Identity exceptions'} value={formatNumber(members.identity_exceptions_open)} warning={Number(members.identity_exceptions_open) > 0} />
              <Metric
                label={ar ? 'آخر طلب' : 'Latest completed order'}
                value={summary.freshness?.latest_order_at ? new Date(summary.freshness.latest_order_at).toLocaleString(ar ? 'ar-LY' : 'en-GB') : '—'}
              />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="card">
              <div className="mb-3 flex items-center gap-2"><Users size={17} className="text-noch-green" /><h2 className="font-semibold text-white">{ar ? 'الأعضاء' : 'Members'}</h2></div>
              <p className="text-3xl font-bold text-white">{formatNumber(members.active)}</p>
              <p className="mt-2 text-xs text-noch-muted">{formatNumber(members.auth_linked)} {ar ? 'حسابات موثقة بـ OTP' : 'OTP-linked accounts'}</p>
              <p className="text-xs text-noch-muted">{formatNumber(members.points_outstanding)} {ar ? 'نقطة مستحقة' : 'points outstanding'}</p>
            </div>
            <div className="card">
              <div className="mb-3 flex items-center gap-2"><ShieldCheck size={17} className="text-cyan-300" /><h2 className="font-semibold text-white">{ar ? 'الموافقة الموثقة' : 'Verified consent'}</h2></div>
              <p className="text-3xl font-bold text-white">{formatNumber(consent.verified_whatsapp)}</p>
              <p className="mt-2 text-xs text-orange-200">{formatNumber(consent.unverified_whatsapp)} {ar ? 'علامات قديمة غير موثقة — لا إرسال' : 'legacy flags unverified — suppressed'}</p>
              <p className="text-xs text-noch-muted">{formatNumber(consent.verified_marketing)} {ar ? 'موافقات تسويق موثقة' : 'verified marketing opt-ins'}</p>
            </div>
            <div className="card">
              <div className="mb-3 flex items-center gap-2"><Gift size={17} className="text-yellow-300" /><h2 className="font-semibold text-white">{ar ? 'التزام المكافآت' : 'Reward obligation'}</h2></div>
              <p className="text-3xl font-bold text-white">{Number(rewards.estimated_obligation_lyd || 0).toFixed(3)} LYD</p>
              <p className="mt-2 text-xs text-noch-muted">{formatNumber(rewards.pending)} {ar ? 'مكافآت معلقة' : 'pending rewards'}</p>
              {Number(rewards.missing_cost) > 0 && <p className="text-xs text-orange-200">{formatNumber(rewards.missing_cost)} {ar ? 'بدون تكلفة مقدّرة' : 'missing cost estimates'}</p>}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold text-white">{ar ? 'الأداء حسب الفرع — منذ الإطلاق' : 'Branch performance — since launch'}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-noch-muted">
                  <tr><th className="py-2 text-start">{ar ? 'الفرع' : 'Branch'}</th><th className="text-end">{ar ? 'الطلبات' : 'Orders'}</th><th className="text-end">{ar ? 'مرتبطة' : 'Linked'}</th><th className="text-end">{ar ? 'المعدل' : 'Rate'}</th></tr>
                </thead>
                <tbody>
                  {(summary.branches || []).map(branch => (
                    <tr key={branch.branch_id} className="border-t border-noch-border">
                      <td className="py-3 text-white">{branch.branch_name}</td>
                      <td className="text-end text-white">{formatNumber(branch.eligible_orders)}</td>
                      <td className="text-end text-white">{formatNumber(branch.linked_orders)}</td>
                      <td className="text-end text-noch-green">{formatPct(branch.link_rate_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-noch-muted">
            {ar ? 'الفترة التاريخية للمقارنة فقط:' : 'Historical comparison only:'} {formatNumber(summary.historical?.linked_orders)} / {formatNumber(summary.historical?.eligible_orders)} ({formatPct(summary.historical?.link_rate_pct)}). {ar ? 'المصدر: طلبات POS المكتملة وسجل الولاء V2.' : 'Source: completed POS orders and the V2 loyalty ledger.'}
          </p>
        </div>
      )}
    </Layout>
  )
}
