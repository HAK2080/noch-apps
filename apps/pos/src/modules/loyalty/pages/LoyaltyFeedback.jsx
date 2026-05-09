// LoyaltyFeedback.jsx — list of recent customer feedback rows.
// Reads loyalty_feedback (rating 1–5 + optional comment + customer link)
// and lets the owner mark items as "actioned" so they drop off the list.

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Star, MessageSquare, CheckCircle, Loader2 } from 'lucide-react'
import Layout from '../../../components/Layout'
import BackButton from '../../../components/shared/BackButton'
import { supabase } from '../../../lib/supabase'
import { useLanguage } from '../../../contexts/LanguageContext'
import toast from 'react-hot-toast'

const FILTERS = [
  { key: 'open',     label_en: 'Open',         label_ar: 'مفتوحة' },
  { key: 'actioned', label_en: 'Actioned',     label_ar: 'تم التعامل' },
  { key: 'all',      label_en: 'All',          label_ar: 'الكل' },
  { key: 'positive', label_en: 'Positive (4+)', label_ar: 'إيجابية (٤+)' },
  { key: 'negative', label_en: 'Negative (≤2)', label_ar: 'سلبية (٢-)' },
]

function ratingTone(r) {
  if (r >= 4) return 'text-noch-green'
  if (r <= 2) return 'text-red-400'
  return 'text-yellow-400'
}

function relTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function LoyaltyFeedback() {
  const { lang } = useLanguage()
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('open')
  const [busyId, setBusyId]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('loyalty_feedback')
        .select('id, customer_id, rating, comment, visit_date, created_at, actioned, customer:loyalty_customers(id, full_name, phone)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setFeedback(data || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = feedback.filter(f => {
    if (filter === 'open')      return !f.actioned
    if (filter === 'actioned')  return !!f.actioned
    if (filter === 'positive')  return Number(f.rating) >= 4
    if (filter === 'negative')  return Number(f.rating) <= 2
    return true
  })

  const markActioned = async (id) => {
    setBusyId(id)
    try {
      const { error } = await supabase
        .from('loyalty_feedback')
        .update({ actioned: true })
        .eq('id', id)
      if (error) throw error
      setFeedback(prev => prev.map(f => f.id === id ? { ...f, actioned: true } : f))
      toast.success(lang === 'ar' ? 'تم تحديد الملاحظة' : 'Marked as actioned')
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <BackButton to="/loyalty" />

        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-noch-green/10 text-noch-green flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl">
                {lang === 'ar' ? 'ملاحظات الزبائن' : 'Customer Feedback'}
              </h1>
              <p className="text-noch-muted text-xs">{visible.length} {lang === 'ar' ? 'ملاحظة' : 'items'}</p>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === f.key
                  ? 'bg-noch-green text-noch-dark'
                  : 'border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white'
              }`}
            >
              {lang === 'ar' ? f.label_ar : f.label_en}
            </button>
          ))}
        </div>

        {loading && <p className="text-noch-muted text-center py-12">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>}

        {!loading && visible.length === 0 && (
          <div className="bg-noch-card border border-noch-border rounded-2xl p-10 text-center">
            <MessageSquare size={32} className="mx-auto text-noch-muted mb-3" />
            <p className="text-white font-semibold">{lang === 'ar' ? 'لا توجد ملاحظات' : 'No feedback yet'}</p>
            <p className="text-noch-muted text-sm mt-1">
              {lang === 'ar' ? 'الملاحظات الجديدة ستظهر هنا.' : 'Customer feedback will appear here when submitted.'}
            </p>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map(f => (
              <li
                key={f.id}
                className={`bg-noch-card border rounded-xl p-4 transition-colors ${
                  f.actioned ? 'border-noch-border/40 opacity-60' : 'border-noch-border hover:border-noch-green/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`flex items-center gap-0.5 ${ratingTone(f.rating)}`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={14} fill={i < f.rating ? 'currentColor' : 'transparent'} />
                        ))}
                      </div>
                      <span className="text-noch-muted text-xs">{relTime(f.created_at)}</span>
                      {f.actioned && (
                        <span className="text-[10px] uppercase tracking-wider bg-noch-green/15 text-noch-green px-1.5 py-0.5 rounded-full">
                          {lang === 'ar' ? 'تم التعامل' : 'Actioned'}
                        </span>
                      )}
                    </div>
                    {f.comment && (
                      <p className="text-white text-sm whitespace-pre-wrap break-words mb-2">"{f.comment}"</p>
                    )}
                    {f.customer && (
                      <Link
                        to={`/loyalty/customers/${f.customer.id}`}
                        className="text-noch-green text-xs hover:underline"
                      >
                        {f.customer.full_name || (lang === 'ar' ? 'بدون اسم' : 'unnamed')}
                        {f.customer.phone && <span className="text-noch-muted"> · {f.customer.phone}</span>}
                      </Link>
                    )}
                  </div>

                  {!f.actioned && (
                    <button
                      onClick={() => markActioned(f.id)}
                      disabled={busyId === f.id}
                      className="flex items-center gap-1 text-xs text-noch-muted hover:text-noch-green border border-noch-border hover:border-noch-green/40 rounded-lg px-2.5 py-1.5 transition-colors flex-shrink-0"
                    >
                      {busyId === f.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      {lang === 'ar' ? 'حدد كمعالجة' : 'Mark actioned'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  )
}
