import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, ArrowRight } from 'lucide-react'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

const TIER_COLORS = {
  bronze: 'text-amber-600 bg-amber-600/10 border-amber-600/30',
  silver: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
  gold: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
}

export default function LoyaltyLeaderboard() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [period, setPeriod] = useState('alltime') // alltime | month
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [period])

  const load = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('loyalty_customers')
        .select('id, full_name, total_stamps, current_stamps, total_visits, tier, last_visit_at, nochi_state')
        .order('total_stamps', { ascending: false })
        .limit(20)

      if (period === 'month') {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        query = supabase
          .from('loyalty_customers')
          .select('id, full_name, total_stamps, current_stamps, total_visits, tier, last_visit_at, nochi_state')
          .gte('last_visit_at', startOfMonth)
          .order('total_stamps', { ascending: false })
          .limit(20)
      }

      const { data, error } = await query
      if (error) throw error
      setCustomers(data || [])
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const medals = ['🥇', '🥈', '🥉']

  const nochiEmoji = {
    happy: '😊', tired: '😴', sick: '🤒', sad: '😢', dead: null
  }

  return (
    <Layout>
      <button onClick={() => navigate('/loyalty')} className="flex items-center gap-2 text-noch-muted hover:text-white text-sm mb-4 transition-colors">
        <ArrowRight size={16} className="rotate-180 rtl:rotate-0" />
        {lang === 'ar' ? 'رجوع' : 'Back'}
      </button>

      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="text-yellow-400" size={24} />
          <div>
            <h1 className="text-white font-bold text-xl">{lang === 'ar' ? 'لوحة المتصدرين' : 'Leaderboard'}</h1>
            <p className="text-noch-muted text-sm">{lang === 'ar' ? 'أكثر العملاء ولاءً' : 'Most loyal customers'}</p>
          </div>
        </div>

        {/* Period toggle */}
        <div className="flex gap-2 mb-6">
          {['alltime', 'month'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${period === p ? 'bg-noch-green text-noch-dark' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}>
              {p === 'alltime' ? (lang === 'ar' ? 'الكل' : 'All Time') : (lang === 'ar' ? 'هذا الشهر' : 'This Month')}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-noch-muted text-center py-12">Loading...</p>
        ) : customers.length === 0 ? (
          <div className="card text-center py-12">
            <Trophy size={40} className="text-noch-muted mx-auto mb-3" />
            <p className="text-noch-muted">{lang === 'ar' ? 'لا يوجد عملاء بعد' : 'No customers yet'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Top 3 podium */}
            {customers.slice(0, 3).length === 3 && (
              <div className="grid grid-cols-3 gap-2 mb-6">
                {[customers[1], customers[0], customers[2]].map((c, podiumIdx) => {
                  const rank = podiumIdx === 1 ? 0 : podiumIdx === 0 ? 1 : 2 // 2nd, 1st, 3rd
                  const heights = ['h-24', 'h-32', 'h-20']
                  return (
                    <div key={c.id} className={`flex flex-col items-center justify-end ${heights[podiumIdx]}`}>
                      <div className="text-2xl mb-1">{medals[rank]}</div>
                      <div className={`w-full rounded-t-xl flex flex-col items-center py-2 px-1 ${rank === 0 ? 'bg-yellow-400/20 border border-yellow-400/40' : rank === 1 ? 'bg-gray-400/20 border border-gray-400/40' : 'bg-amber-600/20 border border-amber-600/40'}`}>
                        <p className="text-white font-semibold text-xs truncate w-full text-center">{c.full_name?.split(' ')[0]}</p>
                        <p className="text-noch-muted text-xs">{c.total_stamps} ☕</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Full list */}
            {customers.map((c, i) => (
              <div key={c.id} onClick={() => navigate(`/loyalty/customers/${c.id}`)}
                className="card flex items-center gap-3 cursor-pointer hover:border-noch-green/30 transition-colors">
                <div className="w-8 text-center">
                  {i < 3 ? <span className="text-xl">{medals[i]}</span> : <span className="text-noch-muted font-semibold text-sm">#{i+1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium text-sm">{c.full_name}</p>
                    {c.tier && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${TIER_COLORS[c.tier] || 'text-noch-muted border-noch-border'}`}>{c.tier}</span>
                    )}
                  </div>
                  <p className="text-noch-muted text-xs">{c.total_visits || 0} {lang === 'ar' ? 'زيارة' : 'visits'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-noch-green font-semibold">{c.total_stamps} ☕</p>
                  <p className="text-noch-muted text-xs">{lang === 'ar' ? 'طابع' : 'stamps'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
