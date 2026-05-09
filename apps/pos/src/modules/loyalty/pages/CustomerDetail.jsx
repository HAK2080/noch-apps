import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Gift, Send, Trash2, Star, Copy, ExternalLink, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { getLoyaltyCustomer, awardLoyaltyStamp, redeemLoyaltyReward, sendLoyaltyNotification, deleteLoyaltyCustomer, requestGoogleReview } from '../../../lib/supabase'
import { getCustomerSegment } from '../../marketing/lib/marketing-supabase'
import SegmentBadge from '../../marketing/components/SegmentBadge'
import { getPOSBranches } from '../../pos/lib/pos-supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import BackButton from '../../../components/shared/BackButton'
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
  const [segment, setSegment] = useState(null)
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

  // Marketing module: load segment + RFM (read-only; soft-fail).
  useEffect(() => {
    if (!id) return
    getCustomerSegment(id).then(setSegment).catch(() => {})
  }, [id])

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
      <BackButton to="/loyalty/customers" />
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

      {/* Nochi Passport — public link, QR, preferences */}
      <PassportSection customer={customer} ar={ar} />

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

      {/* Marketing intelligence (segment + RFM) */}
      {segment && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SegmentBadge segment={segment.segment} />
              <span className="text-noch-muted text-xs">RFM {segment.recency_score}-{segment.frequency_score}-{segment.monetary_score}</span>
            </div>
            <span className="text-noch-muted text-[10px]">refreshed {segment.computed_at ? new Date(segment.computed_at).toLocaleDateString('en-GB') : '—'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-noch-dark/50 rounded px-2 py-1">
              <p className="text-noch-muted text-[10px] uppercase">Visits (180d)</p>
              <p className="text-white font-mono">{segment.total_visits}</p>
            </div>
            <div className="bg-noch-dark/50 rounded px-2 py-1">
              <p className="text-noch-muted text-[10px] uppercase">Spend (180d)</p>
              <p className="text-noch-green font-mono">{Number(segment.total_spend_lyd).toFixed(2)} LYD</p>
            </div>
            <div className="bg-noch-dark/50 rounded px-2 py-1">
              <p className="text-noch-muted text-[10px] uppercase">Last visit</p>
              <p className="text-white">{segment.last_visit_at ? new Date(segment.last_visit_at).toLocaleDateString('en-GB') : '—'}</p>
            </div>
          </div>
        </div>
      )}

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

// ────────────────────────────────────────────────────────────────────
// Passport section — staff view of the customer's public Nochi Pass.
// Shows the URL, QR (for re-printing or scanning), and current
// preferences. Read-only here; customer self-edits via the public
// passport page.
// ────────────────────────────────────────────────────────────────────
const MILK_LABEL = {
  whole: 'Whole', skim: 'Skim', oat: 'Oat', almond: 'Almond',
  soy: 'Soy', lactose_free: 'Lactose-free',
}
const SWEET_LABEL = {
  no_sugar: 'No sugar', less: 'Less', normal: 'Normal', extra: 'Extra',
}

function PassportSection({ customer, ar }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [showQr, setShowQr] = useState(false)
  const [copied, setCopied] = useState(false)

  const token = customer?.passport_token
  const passportUrl = token ? `https://noch.cloud/passport/?t=${token}` : null

  useEffect(() => {
    if (!showQr || !passportUrl) return
    let cancelled = false
    QRCode.toDataURL(passportUrl, { margin: 1, width: 220 })
      .then(u => { if (!cancelled) setQrUrl(u) })
      .catch(() => { if (!cancelled) setQrUrl(null) })
    return () => { cancelled = true }
  }, [showQr, passportUrl])

  const copy = async () => {
    if (!passportUrl) return
    try {
      await navigator.clipboard.writeText(passportUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(ar ? 'تعذر النسخ' : 'Copy failed')
    }
  }

  if (!token) {
    return (
      <div className="card mb-4 text-center py-3 text-noch-muted text-sm">
        {ar ? 'لا توجد بطاقة نوتشي بعد' : 'No Nochi Pass token yet — apply the passport_phase1 migration to backfill.'}
      </div>
    )
  }

  const drinks = Array.isArray(customer.favorite_drinks) ? customer.favorite_drinks : []
  const hasPrefs = drinks.length > 0 || customer.favorite_other || customer.milk_preference || customer.sweetness_preference

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-bold text-sm">
          {ar ? '🐰 بطاقة نوتشي' : '🐰 Nochi Pass'}
        </h2>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${customer.whatsapp_opt_in ? 'bg-noch-green/20 text-noch-green' : 'bg-noch-border/40 text-noch-muted'}`}>
          {customer.whatsapp_opt_in ? (ar ? 'WhatsApp ✓' : 'WhatsApp ✓') : (ar ? 'لا واتساب' : 'No WhatsApp')}
        </span>
      </div>

      <p className="text-noch-muted text-[11px] mb-2 break-all font-mono">{passportUrl}</p>

      <div className="flex gap-2 mb-3">
        <a
          href={passportUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs"
        >
          <ExternalLink size={13} />
          {ar ? 'فتح' : 'Open'}
        </a>
        <button onClick={copy} className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs">
          <Copy size={13} />
          {copied ? (ar ? 'نُسخ' : 'Copied') : (ar ? 'نسخ' : 'Copy')}
        </button>
        <button onClick={() => setShowQr(v => !v)} className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs">
          <QrCode size={13} />
          {showQr ? (ar ? 'إخفاء' : 'Hide QR') : (ar ? 'كود' : 'QR')}
        </button>
      </div>

      {showQr && qrUrl && (
        <div className="bg-white rounded-lg p-3 flex justify-center mb-3">
          <img src={qrUrl} alt="Passport QR" className="w-40 h-40" />
        </div>
      )}

      {hasPrefs ? (
        <div className="border-t border-noch-border pt-3 text-sm space-y-1.5">
          {drinks.length > 0 && (
            <p className="text-white">
              <span className="text-noch-muted">{ar ? 'المشروبات:' : 'Drinks:'} </span>
              {drinks.join(' · ')}
            </p>
          )}
          {customer.favorite_other && (
            <p className="text-white">
              <span className="text-noch-muted">{ar ? 'يحب أيضاً:' : 'Also loves:'} </span>
              {customer.favorite_other}
            </p>
          )}
          {(customer.milk_preference || customer.sweetness_preference) && (
            <p className="text-noch-muted text-xs">
              {customer.milk_preference && (MILK_LABEL[customer.milk_preference] || customer.milk_preference)}
              {customer.milk_preference && customer.sweetness_preference && ' · '}
              {customer.sweetness_preference && (SWEET_LABEL[customer.sweetness_preference] || customer.sweetness_preference)}
            </p>
          )}
        </div>
      ) : (
        <p className="border-t border-noch-border pt-3 text-noch-muted text-xs italic">
          {ar
            ? 'لم يحدد العميل تفضيلاته بعد — اطلب منه فتح بطاقته وملء التفضيلات.'
            : 'Customer hasn\'t set preferences yet — ask them to scan the QR and fill them in.'}
        </p>
      )}
    </div>
  )
}
