// LoyaltyFeedback.jsx — Owner-facing feedback list
// Route: /loyalty/feedback

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, MessageSquare, ChevronLeft, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'

const SENTIMENT_STYLES = {
  positive: 'border-noch-green/30 bg-noch-green/5',
  neutral: 'border-noch-border bg-noch-card',
  negative: 'border-red-500/30 bg-red-500/5',
}

export default function LoyaltyFeedback() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('loyalty_feedback')
        .select('id, rating, comment, sentiment, visit_date, actioned, created_at, customer:loyalty_customers(id, full_name, phone)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (filter !== 'all') query = query.eq('sentiment', filter)
      const { data, error } = await query
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setError(e.message || 'Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/loyalty" className="flex items-center gap-1 text-noch-muted hover:text-white text-sm">
            <ChevronLeft size={16} /> {ar ? 'رجوع' : 'Back'}
          </Link>
          <button onClick={load} disabled={loading} className="text-noch-muted hover:text-white p-2 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div>
          <h1 className="text-white text-xl font-bold">{ar ? 'التقييمات' : 'Feedback'}</h1>
          <p className="text-noch-muted text-sm">{ar ? 'آخر 100 تقييم' : 'Most recent 100'}</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', 'positive', 'neutral', 'negative'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs border ${filter === s ? 'border-noch-green text-noch-green bg-noch-green/10' : 'border-noch-border text-noch-muted hover:text-white'}`}
            >
              {ar ? ({ all: 'الكل', positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي' })[s] : s}
            </button>
          ))}
        </div>

        {error && (
          <div className="card border-red-500/30 bg-red-500/5">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={load} className="text-red-400 underline text-sm mt-1">{ar ? 'إعادة المحاولة' : 'Retry'}</button>
          </div>
        )}

        {loading && rows.length === 0 && (
          <p className="text-noch-muted text-sm">{ar ? 'جاري التحميل...' : 'Loading...'}</p>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="text-noch-muted text-sm">{ar ? 'لا توجد تقييمات' : 'No feedback yet'}</p>
        )}

        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className={`card ${SENTIMENT_STYLES[r.sentiment] || SENTIMENT_STYLES.neutral}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} className={i < r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-noch-muted'} />
                    ))}
                    <span className="text-noch-muted text-xs">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.comment && (
                    <p className="text-white text-sm mt-2 flex items-start gap-2">
                      <MessageSquare size={14} className="text-noch-muted mt-0.5 shrink-0" />
                      {r.comment}
                    </p>
                  )}
                  {r.customer && (
                    <Link to={`/loyalty/customers/${r.customer.id}`} className="text-noch-green text-xs mt-2 inline-block hover:underline">
                      {r.customer.full_name} · {r.customer.phone}
                    </Link>
                  )}
                </div>
                {r.actioned && (
                  <span className="text-noch-green text-xs shrink-0">✓ {ar ? 'تم' : 'Actioned'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
