import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserPlus, Search, RefreshCw } from 'lucide-react'
import { getLoyaltyCustomers } from '../../../lib/supabase'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import NochiBunny from '../components/NochiBunny'
import CustomerRegisterForm from '../components/CustomerRegisterForm'
import toast from 'react-hot-toast'

const TIER_COLORS = {
  bronze: 'text-orange-400',
  silver: 'text-slate-300',
  gold: 'text-yellow-400',
  legend: 'text-purple-400',
}

export default function LoyaltyCustomers() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const stateFilter = searchParams.get('state') || ''

  const ar = lang === 'ar'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filters = {}
      if (stateFilter) filters.nochi_state = stateFilter
      const data = await getLoyaltyCustomers(filters)
      setCustomers(data)
    } catch {
      toast.error(ar ? 'خطأ في التحميل' : 'Load error')
    } finally {
      setLoading(false)
    }
  }, [stateFilter])

  useEffect(() => { load() }, [load])

  const filtered = customers.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  )

  const stateLabels = {
    '': ar ? 'الكل' : 'All',
    happy: ar ? 'سعيد 🐰' : 'Happy 🐰',
    sad: ar ? 'حزين 😢' : 'Sad 😢',
    tired: ar ? 'تعبان 😴' : 'Tired 😴',
    deathbed: ar ? 'مريض 🛏️' : 'Sick 🛏️',
    dead: ar ? 'رحل 💀' : 'Gone 💀',
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-white font-bold text-xl">{ar ? 'عملاء نوتشي' : 'Nochi Customers'}</h1>
          <p className="text-noch-muted text-sm">{filtered.length} {ar ? 'عميل' : 'customers'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary p-2.5"><RefreshCw size={16} /></button>
          <button onClick={() => setShowRegister(true)} className="btn-primary flex items-center gap-2">
            <UserPlus size={16} />
            <span className="hidden sm:inline">{ar ? 'تسجيل' : 'Register'}</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-noch-muted" />
        <input
          className="input ps-9"
          placeholder={ar ? 'ابحث باسم أو هاتف...' : 'Search by name or phone...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* State filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {Object.entries(stateLabels).map(([state, label]) => (
          <button
            key={state}
            onClick={() => navigate(state ? `/loyalty/customers?state=${state}` : '/loyalty/customers')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
              ${stateFilter === state
                ? 'bg-noch-green/20 border-noch-green text-noch-green'
                : 'border-noch-border text-noch-muted hover:border-noch-green/40'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-12">{ar ? 'جاري التحميل...' : 'Loading...'}</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <NochiBunny state="sad" size="lg" lang={lang} />
          <p className="text-noch-muted mt-4">{ar ? 'لا يوجد عملاء' : 'No customers found'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => {
            const days = c.last_visit_at
              ? Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000)
              : null

            return (
              <button
                key={c.id}
                onClick={() => navigate(`/loyalty/customers/${c.id}`)}
                className="card flex items-center gap-3 hover:border-noch-green/40 transition-colors text-start"
              >
                <NochiBunny state={c.nochi_state} size="sm" showLabel={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium truncate">{c.full_name}</p>
                    <span className={`text-xs font-bold ${TIER_COLORS[c.tier]}`}>
                      {c.tier === 'legend' ? '👑' : c.tier === 'gold' ? '🥇' : c.tier === 'silver' ? '🥈' : '🥉'}
                    </span>
                  </div>
                  <p className="text-noch-muted text-xs">
                    {days !== null
                      ? (ar ? `آخر زيارة: ${days} يوم` : `Last visit: ${days} days ago`)
                      : (ar ? 'لم يزر بعد' : 'Never visited')}
                  </p>
                </div>
                <div className="text-end flex-shrink-0">
                  <p className="text-noch-green font-bold text-sm">{c.current_stamps}/9 ☕</p>
                  <p className="text-noch-muted text-xs">{c.total_visits} {ar ? 'زيارة' : 'visits'}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showRegister && (
        <CustomerRegisterForm
          onSuccess={(customer) => {
            setShowRegister(false)
            navigate(`/loyalty/customers/${customer.id}`)
          }}
          onCancel={() => setShowRegister(false)}
        />
      )}
    </Layout>
  )
}
