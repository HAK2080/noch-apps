// MyCard — Customer-facing loyalty card view
// Shows Nochi state, stamp progress, rewards, tier, badges, spin wheel, referral

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode, Gift, Star, Zap, Share2, Globe } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import { getMyLoyaltyCard, submitLoyaltyFeedback, getLoyaltySettings, getLastSpin } from '../../../lib/supabase'
import Layout from '../../../components/Layout'
import NochiBunny from '../components/NochiBunny'
import StampCard from '../components/StampCard'
import BadgeGrid from '../components/BadgeGrid'
import toast from 'react-hot-toast'

function getFrequencyMs(freq) {
  if (freq === 'biweekly') return 14 * 24 * 60 * 60 * 1000
  if (freq === 'monthly') return 30 * 24 * 60 * 60 * 1000
  if (freq === 'off') return Infinity
  return 7 * 24 * 60 * 60 * 1000
}

function msToCountdown(ms) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days > 0) return `${days} days`
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours > 0) return `${hours} hours`
  return 'soon'
}

export default function MyCard() {
  const { user } = useAuth()
  const { lang, setLang } = useLanguage()
  const navigate = useNavigate()
  const [card, setCard] = useState(null)
  const [loyaltySettings, setLoyaltySettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showFeedback, setShowFeedback] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [nextSpinMs, setNextSpinMs] = useState(null)
  const ar = lang === 'ar'

  useEffect(() => {
    if (user) {
      Promise.all([
        getMyLoyaltyCard(user.id),
        getLoyaltySettings(),
      ])
        .then(async ([c, s]) => {
          setCard(c)
          setLoyaltySettings(s)
          if (c && s) {
            const freq = s.spin_frequency || 'weekly'
            if (freq !== 'off') {
              const lastSpin = await getLastSpin(c.id).catch(() => null)
              if (lastSpin) {
                const elapsed = Date.now() - new Date(lastSpin).getTime()
                const required = getFrequencyMs(freq)
                if (elapsed < required) setNextSpinMs(required - elapsed)
              }
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [user])

  const handleFeedback = async () => {
    if (!rating) return toast.error(ar ? 'اختر تقييماً' : 'Select a rating')
    setSubmitting(true)
    try {
      await submitLoyaltyFeedback(card.id, rating, comment)
      toast.success(ar ? 'شكراً على تقييمك! 🐰' : 'Thanks for your feedback! 🐰')
      setShowFeedback(false)
      setRating(0)
      setComment('')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReferral = () => {
    if (!card?.referral_code) {
      toast(ar ? 'لا يوجد رمز إحالة بعد' : 'No referral code yet')
      return
    }
    const msg = ar
      ? `انضم إلى برنامج ولاء نوش! استخدم كودي: ${card.referral_code} → https://noch.cloud/my-card?ref=${card.referral_code}`
      : `Join Nochi loyalty at Noch café! Use my code: ${card.referral_code} → https://noch.cloud/my-card?ref=${card.referral_code}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">...</p></Layout>

  if (!card) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <NochiBunny state="sad" size="xl" lang={lang} />
          <p className="text-white text-lg font-bold">{ar ? 'ليس لديك بطاقة نوتشي بعد!' : 'You don\'t have a Nochi card yet!'}</p>
          <p className="text-noch-muted text-sm text-center">
            {ar ? 'تحدث مع أحد الموظفين لتسجيلك في برنامج الولاء' : 'Talk to a staff member to register in the loyalty program'}
          </p>
        </div>
      </Layout>
    )
  }

  const pendingRewards = (card.rewards || []).filter(r => r.status === 'pending')
  const days = card.last_visit_at
    ? Math.floor((Date.now() - new Date(card.last_visit_at).getTime()) / 86400000)
    : null
  const spinEnabled = loyaltySettings?.spin_frequency !== 'off'
  const spinAvailable = spinEnabled && !nextSpinMs

  return (
    <Layout>
      {/* Language toggle */}
      <div className="flex justify-end mb-2 gap-1">
        <button
          onClick={() => setLang('ar')}
          className={`px-2 py-1 text-xs rounded-lg border transition-colors ${lang === 'ar' ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'border-noch-border text-noch-muted hover:text-white'}`}
        >
          🇱🇾 عربي
        </button>
        <button
          onClick={() => setLang('en')}
          className={`px-2 py-1 text-xs rounded-lg border transition-colors ${lang === 'en' ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'border-noch-border text-noch-muted hover:text-white'}`}
        >
          <Globe size={11} className="inline mr-1" />EN
        </button>
      </div>

      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-white font-bold text-xl">{ar ? `أهلاً ${card.full_name}! 🐰` : `Welcome ${card.full_name}! 🐰`}</h1>
        <p className="text-noch-muted text-sm">{ar ? 'بطاقة نوتشي الخاصة بك' : 'Your Nochi loyalty card'}</p>
      </div>

      {/* Nochi mascot */}
      <div className="flex justify-center mb-4">
        <NochiBunny state={card.nochi_state} size="xl" lang={lang} />
      </div>

      {/* Stamp card */}
      <div className="mb-4">
        <StampCard
          currentStamps={card.current_stamps}
          goal={loyaltySettings?.stamp_goal || 9}
          tier={card.tier}
          lang={lang}
        />
      </div>

      {/* Points display */}
      {card.points !== undefined && (
        <div className="card mb-4 bg-yellow-500/5 border-yellow-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-yellow-400" />
            <p className="text-white font-semibold text-sm">{ar ? 'نقاطك' : 'Your Points'}</p>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-yellow-400 font-bold text-3xl">{card.points || 0}</span>
            <span className="text-noch-muted text-sm">{ar ? 'نقطة' : 'pts'}</span>
          </div>
          {loyaltySettings?.points_per_reward > 0 && (
            <div>
              <div className="flex justify-between text-xs text-noch-muted mb-1">
                <span>{ar ? 'نحو المكافأة القادمة' : 'Toward next reward'}</span>
                <span>{card.points || 0} / {loyaltySettings.points_per_reward}</span>
              </div>
              <div className="w-full bg-noch-border rounded-full h-2">
                <div
                  className="bg-yellow-400 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((card.points || 0) % loyaltySettings.points_per_reward) / loyaltySettings.points_per_reward * 100)}%` }}
                />
              </div>
              {(card.points || 0) >= loyaltySettings.points_per_reward && (
                <p className="text-noch-green text-xs mt-1 font-medium">
                  {ar ? '🎉 لديك نقاط كافية للمكافأة!' : '🎉 You have enough points for a reward!'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spin Wheel */}
      {spinEnabled && (
        <div className="card mb-4 bg-noch-green/5 border-noch-green/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎡</span>
            <p className="text-white font-semibold text-sm">{ar ? 'اعجلة نوتشي' : "Nochi's Wheel"}</p>
          </div>
          {spinAvailable ? (
            <button
              onClick={() => navigate(`/loyalty/spin`)}
              className="w-full py-3 rounded-xl bg-noch-green text-noch-dark font-bold hover:bg-noch-green/90 transition-colors"
            >
              {ar ? '🎡 العب الآن!' : '🎡 Spin Now!'}
            </button>
          ) : (
            <p className="text-noch-muted text-sm">
              {ar ? `العودة خلال ${msToCountdown(nextSpinMs)}` : `Next spin in ${msToCountdown(nextSpinMs)}`}
            </p>
          )}
        </div>
      )}

      {/* Pending rewards */}
      {pendingRewards.length > 0 && (
        <div className="card mb-4 border-yellow-500/40 bg-yellow-500/10">
          <div className="flex items-center gap-2 mb-2">
            <Gift size={18} className="text-yellow-400" />
            <p className="text-yellow-400 font-bold">{ar ? '🎉 لديك مكافأة جاهزة!' : '🎉 You have a reward ready!'}</p>
          </div>
          {pendingRewards.map(r => (
            <p key={r.id} className="text-white text-sm">
              🎁 {r.description || (ar ? 'مشروب مجاني' : 'Free drink')}
              <span className="text-noch-muted text-xs ms-2">
                ({ar ? 'أرِه للبارستا' : 'Show to barista'})
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card text-center">
          <p className="text-noch-green font-bold text-xl">{card.total_visits || 0}</p>
          <p className="text-noch-muted text-xs">{ar ? 'زيارة' : 'Visits'}</p>
        </div>
        <div className="card text-center">
          <p className="text-yellow-400 font-bold text-xl">{card.current_streak || 0}🔥</p>
          <p className="text-noch-muted text-xs">{ar ? 'سلسلة' : 'Streak'}</p>
        </div>
        <div className="card text-center">
          <p className="text-blue-400 font-bold text-xl">{days ?? '—'}</p>
          <p className="text-noch-muted text-xs">{ar ? 'يوم مضى' : 'Days ago'}</p>
        </div>
      </div>

      {/* Badge grid */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🏅</span>
          <p className="text-white font-semibold text-sm">{ar ? 'شاراتك' : 'Your Badges'}</p>
        </div>
        <BadgeGrid customerId={card.id} />
      </div>

      {/* Referral */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Share2 size={16} className="text-noch-green" />
          <p className="text-white font-semibold text-sm">{ar ? 'ادعُ صديقاً' : 'Invite a Friend'}</p>
        </div>
        {card.referral_code && (
          <p className="text-noch-muted text-xs mb-2">
            {ar ? 'رمز الإحالة:' : 'Your code:'}{' '}
            <span className="text-noch-green font-mono font-bold">{card.referral_code}</span>
          </p>
        )}
        <button
          onClick={handleReferral}
          className="w-full py-2.5 rounded-xl border border-noch-green/30 text-noch-green text-sm font-medium hover:bg-noch-green/10 transition-colors flex items-center justify-center gap-2"
        >
          <Share2 size={14} />
          {ar ? 'شارك عبر واتساب' : 'Share via WhatsApp'}
        </button>
      </div>

      {/* Rate last visit */}
      <button
        onClick={() => setShowFeedback(true)}
        className="w-full card mb-4 flex items-center justify-center gap-2 hover:border-noch-green/40 transition-colors"
      >
        <Star size={16} className="text-yellow-400" />
        <span className="text-sm text-noch-muted">{ar ? 'قيّم زيارتك الأخيرة' : 'Rate your last visit'}</span>
      </button>

      {/* Feedback modal */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 px-0 md:px-4">
          <div className="card w-full md:max-w-sm rounded-t-3xl md:rounded-2xl">
            <div className="text-center mb-4">
              <NochiBunny state="happy" size="md" showLabel={false} />
              <h2 className="text-white font-bold mt-2">{ar ? 'كيف كانت تجربتك؟' : 'How was your experience?'}</h2>
            </div>

            <div className="flex justify-center gap-3 mb-4">
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onClick={() => setRating(s)}
                  className={`text-3xl transition-transform ${rating >= s ? 'scale-110' : 'opacity-40'}`}
                >
                  ⭐
                </button>
              ))}
            </div>

            <textarea
              className="input resize-none h-20 mb-4"
              placeholder={ar ? 'تعليق إضافي (اختياري)...' : 'Additional comment (optional)...'}
              value={comment}
              onChange={e => setComment(e.target.value)}
            />

            <div className="flex gap-3">
              <button onClick={() => setShowFeedback(false)} className="btn-secondary flex-1">
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleFeedback} disabled={submitting || !rating} className="btn-primary flex-1">
                {submitting ? '...' : (ar ? 'إرسال 🐰' : 'Send 🐰')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
