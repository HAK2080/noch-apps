import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Star, Gift, TrendingUp, AlertTriangle, RefreshCw, MessageSquare, Trophy } from 'lucide-react'
import { getLoyaltyStats, getLoyaltyCustomers } from '../../../lib/supabase'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import NochiBunny from '../components/NochiBunny'
import toast from 'react-hot-toast'

export default function LoyaltyDashboard() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [atRisk, setAtRisk] = useState([])
  const [loading, setLoading] = useState(true)

  const [notSetup, setNotSetup] = useState(false)

  const load = async () => {
    setLoading(true)
    setNotSetup(false)
    try {
      const [s, customers] = await Promise.all([
        getLoyaltyStats(),
        getLoyaltyCustomers({ nochi_state: ['sad', 'tired', 'deathbed', 'dead'] }),
      ])
      // null stats = migration not run yet
      if (s === null) { setNotSetup(true); return }
      setStats(s)
      setAtRisk((customers || []).slice(0, 5))
    } catch (err) {
      // Network failure or other real error
      toast.error(lang === 'ar' ? 'خطأ في الاتصال' : 'Connection error')
      console.error('Loyalty load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const ar = lang === 'ar'

  const statCards = stats ? [
    { icon: Users, label: ar ? 'إجمالي العملاء' : 'Total Customers', value: stats.total_customers, color: 'text-noch-green' },
    { icon: TrendingUp, label: ar ? 'نشطون هذا الأسبوع' : 'Active This Week', value: stats.active_week, color: 'text-blue-400' },
    { icon: Gift, label: ar ? 'مكافآت بانتظار الاسترداد' : 'Rewards Pending', value: stats.rewards_pending, color: 'text-yellow-400' },
    { icon: Star, label: ar ? 'متوسط التقييم (أسبوع)' : 'Avg Rating (week)', value: stats.avg_rating_week ? `${stats.avg_rating_week}⭐` : '—', color: 'text-orange-400' },
  ] : []

  const nochiAlerts = stats ? [
    { state: 'sad', count: stats.sad_customers, label: ar ? 'يفتقدون نوتشي 😢' : 'Miss Nochi 😢', color: 'text-blue-400' },
    { state: 'tired', count: stats.tired_customers, label: ar ? 'نوتشي تعبان 😴' : 'Nochi tired 😴', color: 'text-yellow-400' },
    { state: 'deathbed', count: stats.deathbed_customers, label: ar ? 'نوتشي مريض 🛏️' : 'Nochi sick 🛏️', color: 'text-orange-400' },
    { state: 'dead', count: stats.dead_customers, label: ar ? 'نوتشي رحل 💀' : 'Nochi gone 💀', color: 'text-red-400' },
  ].filter(a => a.count > 0) : []

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">{ar ? 'نوتشي لويالتي' : 'Nochi Loyalty'}</h1>
          <p className="text-noch-muted text-sm">{ar ? 'لوحة التحكم' : 'Dashboard'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary p-2.5"><RefreshCw size={16} /></button>
          <button onClick={() => navigate('/loyalty/customers')} className="btn-primary flex items-center gap-2">
            <Users size={16} />
            <span className="hidden sm:inline">{ar ? 'العملاء' : 'Customers'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-16">{ar ? 'جاري التحميل...' : 'Loading...'}</p>
      ) : notSetup ? (
        <div className="card text-center py-12 flex flex-col items-center gap-4">
          <NochiBunny state="happy" size="xl" showLabel={false} />
          <div>
            <h2 className="text-white font-bold text-lg mb-1">
              {ar ? 'نوتشي جاهز! فقط نحتاج إعداد قاعدة البيانات' : 'Nochi is ready! Just needs database setup'}
            </h2>
            <p className="text-noch-muted text-sm max-w-sm mx-auto">
              {ar
                ? 'قم بتشغيل ملف الـ migration في Supabase لتفعيل نظام الولاء'
                : 'Run the loyalty migration in Supabase to activate the loyalty system'}
            </p>
          </div>
          <div className="bg-noch-dark rounded-xl p-4 text-left w-full max-w-md">
            <p className="text-noch-muted text-xs mb-2 font-mono">supabase/migrations/20260412180000_loyalty_system.sql</p>
            <p className="text-noch-green text-xs font-mono">
              {'→ Supabase Dashboard > SQL Editor > paste & run'}
            </p>
          </div>
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={14} />
            {ar ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {statCards.map((s, i) => (
              <div key={i} className="card flex flex-col gap-1">
                <s.icon size={18} className={s.color} />
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-noch-muted">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Nochi Alert Panel */}
          {nochiAlerts.length > 0 && (
            <div className="card mb-6 border-orange-500/30 bg-orange-500/5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className="text-orange-400" />
                <h2 className="text-white font-semibold text-sm">
                  {ar ? 'تنبيهات نوتشي — عملاء يحتاجون اهتمام' : 'Nochi Alerts — Customers Need Attention'}
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {nochiAlerts.map(a => (
                  <button
                    key={a.state}
                    onClick={() => navigate(`/loyalty/customers?state=${a.state}`)}
                    className="flex items-center gap-2 p-2 rounded-xl bg-noch-dark hover:bg-noch-border transition-colors"
                  >
                    <NochiBunny state={a.state} size="sm" showLabel={false} />
                    <div className="text-start">
                      <p className={`font-bold text-lg ${a.color}`}>{a.count}</p>
                      <p className="text-xs text-noch-muted">{a.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* At-Risk Customers */}
          {atRisk.length > 0 && (
            <div className="card mb-6">
              <h2 className="text-white font-semibold text-sm mb-3">
                {ar ? '🚨 أكثر عملاء يحتاجون استعادة' : '🚨 Customers Needing Re-engagement'}
              </h2>
              <div className="flex flex-col gap-2">
                {atRisk.map(c => {
                  const days = c.last_visit_at
                    ? Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000)
                    : null
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/loyalty/customers/${c.id}`)}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-noch-dark transition-colors text-start"
                    >
                      <NochiBunny state={c.nochi_state} size="sm" showLabel={false} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{c.full_name}</p>
                        <p className="text-noch-muted text-xs">
                          {days ? (ar ? `${days} يوم بدون زيارة` : `${days} days without a visit`) : (ar ? 'لم يزر بعد' : 'Never visited')}
                        </p>
                      </div>
                      <span className="text-xs text-noch-muted">{c.current_stamps}/9 ☕</span>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => navigate('/loyalty/customers')}
                className="w-full mt-3 text-center text-xs text-noch-green hover:underline"
              >
                {ar ? 'عرض جميع العملاء' : 'View all customers'}
              </button>
            </div>
          )}

          {/* Negative feedback this week */}
          {stats?.negative_feedback_week > 0 && (
            <div className="card border-red-500/30 bg-red-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-red-400" />
                  <p className="text-white text-sm font-medium">
                    {ar ? `${stats.negative_feedback_week} تغذية راجعة سلبية هذا الأسبوع` : `${stats.negative_feedback_week} negative feedback this week`}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/loyalty/feedback')}
                  className="text-xs text-red-400 hover:underline"
                >
                  {ar ? 'عرض' : 'View'}
                </button>
              </div>
            </div>
          )}

          {/* Quick navigation */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { label: ar ? '👥 العملاء' : '👥 Customers', path: '/loyalty/customers' },
              { label: ar ? '🎁 المكافآت' : '🎁 Rewards', path: '/loyalty/rewards' },
              { label: ar ? '☕ الطوابع' : '☕ Stamp', path: '/loyalty/stamp' },
              { label: ar ? '🎡 العجلة' : '🎡 Spin Wheel', path: '/loyalty/spin' },
              { label: ar ? '🤲 الإيماءات' : '🤲 Gestures', path: '/loyalty/gestures' },
              { label: ar ? '📱 QR الكاونتر' : '📱 Counter QR', path: '/loyalty/qr' },
              { label: ar ? '⚙️ الإعدادات' : '⚙️ Settings', path: '/loyalty/settings' },
              { label: ar ? '🏆 المتصدرين' : '🏆 Leaderboard', path: '/loyalty/leaderboard' },
            ].map(item => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="card text-center hover:border-noch-green/40 transition-colors cursor-pointer"
              >
                <p className="text-white text-sm font-medium">{item.label}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}
