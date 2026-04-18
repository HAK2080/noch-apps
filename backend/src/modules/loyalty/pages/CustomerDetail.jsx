import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Gift, Send, Trash2, Star } from 'lucide-react'
import { getLoyaltyCustomer, awardLoyaltyStamp, redeemLoyaltyReward, sendLoyaltyNotification, deleteLoyaltyCustomer, requestGoogleReview } from '../../../lib/supabase'
import { getPOSBranches } from '../../pos/lib/pos-supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import NochiBunny from '../components/NochiBunny'
import StampCard from '../components/StampCard'
import ConfirmModal from '../../../components/shared/ConfirmModal'
import toast from 'react-hot-toast'

const NOTIFY_TYPES = [
  { type: 'random_love', ar: '🌹 رسالة محبة عشوائية', en: '🌹 Random Love Message' },
  { type: 'nochi_sad', ar: '😢 تنبيه حزن نوتشي', en: '😢 Nochi Sad Alert' },
  { type: 'nochi_tired', ar: '😴 نوتشي تعبان', en: '😴 Nochi Tired' },
  { type: 'nochi_deathbed', ar: '🛏️ نوتشي مريض', en: '🛏️ Nochi Sick' },
  { type: 'birthday', ar: '🎂 تهنئة عيد ميلاد', en: '🎂 Birthday Wish' },
]

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { lang } = useLanguage()
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stampLoading, setStampLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ar = lang === 'ar'

  const load = async () => {
    try {
      const data = await getLoyaltyCustomer(id)
      setCustomer(data)
    } catch {
      toast.error(ar ? 'خطأ في التحميل' : 'Load error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleAwardStamp = async () => {
    setStampLoading(true)
    try {
      const result = await awardLoyaltyStamp(id, user?.id)
      if (result.reward_earned) {
        toast.success(ar ? '🎉 حصل على مشروب مجاني! مبروك!' : '🎉 Free drink earned! Congrats!')
      } else {
        toast.success(ar ? `☕ طابع ${result.current_stamps}/9 — أحسنت!` : `☕ Stamp ${result.current_stamps}/9 — Great!`)
      }
      load()
    } catch (err) {
      toast.error(err.message || (ar ? 'خطأ' : 'Error'))
    } finally {
      setStampLoading(false)
    }
  }

  const handleRedeem = async (rewardId) => {
    try {
      await redeemLoyaltyReward(rewardId, user?.id)
      toast.success(ar ? '🎁 تم استرداد المكافأة!' : '🎁 Reward redeemed!')
      load()
    } catch (err) {
      toast.error(err.message || (ar ? 'خطأ' : 'Error'))
    }
  }

  const handleNotify = async (type) => {
    try {
      await sendLoyaltyNotification(id, type)
      toast.success(ar ? 'تم إرسال الرسالة ✓' : 'Message sent ✓')
    } catch (err) {
      toast.error(err.message || (ar ? 'خطأ في الإرسال' : 'Send error'))
    }
  }

  const handleDelete = async () => {
    try {
      await deleteLoyaltyCustomer(id)
      toast.success(ar ? 'تم حذف العميل' : 'Customer deleted')
      navigate('/loyalty/customers')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRequestReview = async () => {
    try {
      // loyalty_customers has no branch_id — fetch branches and pick the first with a google_maps_url
      const branches = await getPOSBranches().catch(() => [])
      const branchWithUrl = branches.find(b => b.google_maps_url) || branches[0]
      const result = await requestGoogleReview(customer.id, branchWithUrl?.id || null)
      const mapsUrl = result.branch?.google_maps_url || branchWithUrl?.google_maps_url
      if (mapsUrl) {
        await navigator.clipboard.writeText(mapsUrl).catch(() => {})
        toast.success(
          ar
            ? `تم! رابط Google Maps منسوخ للحافظة: ${mapsUrl}`
            : `Done! Google Maps URL copied: ${mapsUrl}`,
          { duration: 6000 }
        )
      } else {
        toast.success(ar ? 'تم تسجيل طلب المراجعة ✓' : 'Review request recorded ✓')
      }
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">{ar ? 'جاري التحميل...' : 'Loading...'}</p></Layout>
  if (!customer) return <Layout><p className="text-red-400 text-center py-16">{ar ? 'العميل غير موجود' : 'Customer not found'}</p></Layout>

  const pendingRewards = (customer.rewards || []).filter(r => r.status === 'pending')
  const days = customer.last_visit_at
    ? Math.floor((Date.now() - new Date(customer.last_visit_at).getTime()) / 86400000)
    : null

  const reviewRequestedAt = customer.review_requested_at ? new Date(customer.review_requested_at) : null
  const reviewRequestedDaysAgo = reviewRequestedAt
    ? Math.floor((Date.now() - reviewRequestedAt.getTime()) / 86400000)
    : null
  const reviewRecentlyRequested = reviewRequestedDaysAgo !== null && reviewRequestedDaysAgo < 30

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/loyalty/customers')} className="text-noch-muted hover:text-white">
          <ArrowRight size={20} className={ar ? 'rotate-0' : 'rotate-180'} />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">{customer.full_name}</h1>
          <p className="text-noch-muted text-sm">{customer.phone}</p>
        </div>
        <button onClick={() => setConfirmDelete(true)} className="text-red-400 hover:text-red-300 p-2">
          <Trash2 size={16} />
        </button>
      </div>

      {/* Nochi + Stamp Card */}
      <div className="card mb-4 flex flex-col items-center gap-4">
        <NochiBunny state={customer.nochi_state} size="lg" lang={lang} />
        <div className="w-full">
          <StampCard
            currentStamps={customer.current_stamps}
            goal={9}
            tier={customer.tier}
            lang={lang}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card text-center">
          <p className="text-noch-green font-bold text-xl">{customer.total_visits}</p>
          <p className="text-noch-muted text-xs">{ar ? 'زيارات' : 'Visits'}</p>
        </div>
        <div className="card text-center">
          <p className="text-yellow-400 font-bold text-xl">{customer.current_streak}</p>
          <p className="text-noch-muted text-xs">{ar ? 'سلسلة' : 'Streak'}</p>
        </div>
        <div className="card text-center">
          <p className="text-blue-400 font-bold text-xl">{days ?? '—'}</p>
          <p className="text-noch-muted text-xs">{ar ? 'يوم منذ آخر زيارة' : 'Days since visit'}</p>
        </div>
      </div>

      {/* Award Stamp */}
      <div className="card mb-4">
        <p className="text-noch-muted text-xs mb-3">{ar ? 'منح طابع' : 'Award Stamp'}</p>
        <button
          onClick={handleAwardStamp}
          disabled={stampLoading}
          className="w-full btn-primary py-4 text-lg font-bold"
        >
          {stampLoading ? '...' : (ar ? '☕ امنح طابعاً' : '☕ Award Stamp')}
        </button>
      </div>

      {/* Pending Rewards */}
      {pendingRewards.length > 0 && (
        <div className="card mb-4 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Gift size={16} className="text-yellow-400" />
            <p className="text-white font-semibold text-sm">{ar ? 'مكافآت جاهزة للاسترداد' : 'Rewards Ready to Redeem'}</p>
          </div>
          {pendingRewards.map(r => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-noch-dark rounded-xl mb-2">
              <div>
                <p className="text-white text-sm font-medium">🎁 {r.description || (ar ? 'مشروب مجاني' : 'Free drink')}</p>
                <p className="text-noch-muted text-xs">
                  {ar ? 'ينتهي في:' : 'Expires:'} {new Date(r.expires_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => handleRedeem(r.id)} className="btn-primary text-sm px-3 py-1.5">
                {ar ? 'استرداد' : 'Redeem'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Google Review Nudge */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Star size={16} className="text-yellow-400" />
          <p className="text-white font-semibold text-sm">{ar ? 'طلب مراجعة Google' : 'Google Review'}</p>
        </div>
        {reviewRecentlyRequested ? (
          <p className="text-noch-muted text-sm">
            {ar
              ? `✓ تم طلب المراجعة ${reviewRequestedDaysAgo === 0 ? 'اليوم' : `منذ ${reviewRequestedDaysAgo} يوم`}`
              : `✓ Review requested ${reviewRequestedDaysAgo === 0 ? 'today' : `${reviewRequestedDaysAgo} days ago`}`}
          </p>
        ) : (
          <button
            onClick={handleRequestReview}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Star size={14} className="text-yellow-400" />
            {ar ? '⭐ طلب مراجعة Google' : '⭐ Request Google Review'}
          </button>
        )}
      </div>

      {/* Notifications */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Send size={16} className="text-noch-green" />
          <p className="text-white font-semibold text-sm">{ar ? 'إرسال رسالة نوتشي' : 'Send Nochi Message'}</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {NOTIFY_TYPES.map(n => (
            <button
              key={n.type}
              onClick={() => handleNotify(n.type)}
              className="text-start px-3 py-2 rounded-xl border border-noch-border hover:border-noch-green/40 text-sm text-noch-muted hover:text-white transition-colors"
            >
              {ar ? n.ar : n.en}
            </button>
          ))}
        </div>
      </div>

      {/* Visit History */}
      {customer.stamps?.length > 0 && (
        <div className="card mb-4">
          <p className="text-white font-semibold text-sm mb-3">{ar ? 'سجل الزيارات' : 'Visit History'}</p>
          <div className="flex flex-col gap-1">
            {customer.stamps.slice(0, 10).map((s, i) => (
              <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-noch-border/30 last:border-0">
                <span className="text-noch-muted">
                  {new Date(s.created_at).toLocaleDateString(ar ? 'ar-LY' : 'en-GB')}
                </span>
                <span className="text-noch-green">☕ طابع {s.stamp_number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback History */}
      {customer.feedback?.length > 0 && (
        <div className="card mb-4">
          <p className="text-white font-semibold text-sm mb-3">{ar ? 'التغذية الراجعة' : 'Feedback History'}</p>
          <div className="flex flex-col gap-2">
            {customer.feedback.slice(0, 5).map(f => (
              <div key={f.id} className="p-2 rounded-xl bg-noch-dark text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-yellow-400">{'⭐'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                  <span className="text-noch-muted">{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                {f.comment && <p className="text-noch-muted">{f.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          message={ar ? `هل تريد حذف ${customer.full_name}؟` : `Delete ${customer.full_name}?`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Layout>
  )
}
