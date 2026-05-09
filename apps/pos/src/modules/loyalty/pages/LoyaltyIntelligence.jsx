import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Users, TrendingDown, Star, Sparkles, ChevronRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Layout from '../../../components/Layout'
import BackButton from '../../../components/shared/BackButton'
import { getLoyaltyCustomers } from '../../../lib/supabase'
import { useLanguage } from '../../../contexts/LanguageContext'

const SEGMENTS = [
  {
    id: 'at_risk',
    label: 'At Risk',
    labelAr: 'في خطر',
    icon: TrendingDown,
    color: 'red',
    desc: 'No visit in 14+ days',
    descAr: 'لم يزوروا منذ أكثر من 14 يوم',
    action: 'Send a win-back message or gesture',
    actionAr: 'أرسل رسالة استعادة أو هدية',
    filter: c => {
      if (!c.last_visit_at) return true
      const days = (Date.now() - new Date(c.last_visit_at).getTime()) / 86400000
      return days >= 14
    },
  },
  {
    id: 'drifting',
    label: 'Drifting',
    labelAr: 'مبتعدون',
    icon: TrendingDown,
    color: 'amber',
    desc: 'No visit in 7–13 days',
    descAr: 'لم يزوروا منذ 7-13 يوم',
    action: 'Nudge with a friendly reminder',
    actionAr: 'تذكيرهم برسالة لطيفة',
    filter: c => {
      if (!c.last_visit_at) return false
      const days = (Date.now() - new Date(c.last_visit_at).getTime()) / 86400000
      return days >= 7 && days < 14
    },
  },
  {
    id: 'champions',
    label: 'Champions',
    labelAr: 'أبطال',
    icon: Star,
    color: 'green',
    desc: 'Gold or Legend tier',
    descAr: 'المستوى الذهبي أو الأسطوري',
    action: 'Reward their loyalty — exclusive offer or thank-you',
    actionAr: 'كافئهم على وفائهم — عرض حصري أو شكر',
    filter: c => c.tier === 'gold' || c.tier === 'legend',
  },
  {
    id: 'new',
    label: 'New joiners',
    labelAr: 'منضمون جدد',
    icon: Users,
    color: 'blue',
    desc: 'Joined in the last 7 days',
    descAr: 'انضموا خلال آخر 7 أيام',
    action: 'Welcome them — share what makes Noch special',
    actionAr: 'رحب بهم — شاركهم ما يميز نوخ',
    filter: c => {
      if (!c.created_at) return false
      const days = (Date.now() - new Date(c.created_at).getTime()) / 86400000
      return days <= 7
    },
  },
]

const COLOR_STYLES = {
  red:   { border: 'border-red-500/40',   bg: 'bg-red-500/10',   text: 'text-red-400',   badge: 'bg-red-500/20 text-red-400' },
  amber: { border: 'border-amber-400/40', bg: 'bg-amber-400/10', text: 'text-amber-400', badge: 'bg-amber-400/20 text-amber-400' },
  green: { border: 'border-noch-green/40', bg: 'bg-noch-green/10', text: 'text-noch-green', badge: 'bg-noch-green/20 text-noch-green' },
  blue:  { border: 'border-blue-400/40',  bg: 'bg-blue-400/10',  text: 'text-blue-400',  badge: 'bg-blue-400/20 text-blue-400' },
}

export default function LoyaltyIntelligence() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    getLoyaltyCustomers()
      .then(setCustomers)
      .catch(e => toast.error(e.message || 'Load failed'))
      .finally(() => setLoading(false))
  }, [])

  const segments = SEGMENTS.map(s => ({
    ...s,
    members: customers.filter(s.filter),
  }))

  const totalCustomers = customers.length

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <BackButton to="/loyalty" />

        <div className="flex items-center gap-3 mb-6 mt-2">
          <div className="w-10 h-10 rounded-xl bg-noch-green/10 text-noch-green flex items-center justify-center">
            <Brain size={20} />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">
              {ar ? 'ذكاء العملاء' : 'Customer Intelligence'}
            </h1>
            <p className="text-noch-muted text-sm">
              {loading
                ? (ar ? 'جارٍ التحميل…' : 'Loading…')
                : (ar ? `${totalCustomers} عميل مسجّل` : `${totalCustomers} registered customers`)}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-noch-muted">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {segments.map(seg => {
              const styles = COLOR_STYLES[seg.color]
              const isExpanded = expanded === seg.id
              const Icon = seg.icon

              return (
                <div
                  key={seg.id}
                  className={`bg-noch-card border rounded-2xl overflow-hidden transition-colors ${styles.border}`}
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : seg.id)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-noch-card-hover transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${styles.bg} ${styles.text}`}>
                        <Icon size={16} />
                      </div>
                      <div>
                        <p className="text-white font-semibold">
                          {ar ? seg.labelAr : seg.label}
                        </p>
                        <p className="text-noch-muted text-xs">
                          {ar ? seg.descAr : seg.desc}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${styles.badge}`}>
                        {seg.members.length}
                      </span>
                      <ChevronRight
                        size={16}
                        className={`text-noch-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-noch-border">
                      {/* Suggested action */}
                      <div className={`flex items-start gap-2 px-5 py-3 ${styles.bg}`}>
                        <Sparkles size={14} className={`mt-0.5 flex-shrink-0 ${styles.text}`} />
                        <p className={`text-sm font-medium ${styles.text}`}>
                          {ar ? seg.actionAr : seg.action}
                        </p>
                      </div>

                      {/* Customer list */}
                      {seg.members.length === 0 ? (
                        <p className="text-noch-muted text-sm px-5 py-4">
                          {ar ? 'لا يوجد عملاء في هذا القطاع' : 'No customers in this segment'}
                        </p>
                      ) : (
                        <div className="divide-y divide-noch-border">
                          {seg.members.slice(0, 20).map(c => (
                            <Link
                              key={c.id}
                              to={`/loyalty/customers/${c.id}`}
                              className="flex items-center justify-between px-5 py-3 hover:bg-noch-card-hover transition-colors"
                            >
                              <div>
                                <p className="text-white text-sm font-medium">{c.full_name}</p>
                                <p className="text-noch-muted text-xs">{c.phone}</p>
                              </div>
                              <div className="text-right">
                                {c.last_visit_at && (
                                  <p className="text-noch-muted text-xs">
                                    {ar ? 'آخر زيارة' : 'Last visit'}{' '}
                                    {Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000)}d ago
                                  </p>
                                )}
                                {c.tier && (
                                  <p className="text-noch-muted text-xs capitalize">{c.tier}</p>
                                )}
                              </div>
                            </Link>
                          ))}
                          {seg.members.length > 20 && (
                            <Link
                              to={`/loyalty/customers`}
                              className="block px-5 py-3 text-noch-green text-sm text-center hover:bg-noch-card-hover"
                            >
                              {ar
                                ? `عرض كل ${seg.members.length} عميل`
                                : `See all ${seg.members.length} customers`}
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
