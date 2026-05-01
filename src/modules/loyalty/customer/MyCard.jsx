// MyCard — Customer-facing loyalty card view
// Shows Nochi state, stamp progress, rewards, tier, badges, spin wheel, referral

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode, Gift, Star, Zap, Share2, Globe, Crown, Trophy, Award, Sparkles } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import { getMyLoyaltyCard, submitLoyaltyFeedback, getLoyaltySettings, getLastSpin, supabase } from '../../../lib/supabase'
import Layout from '../../../components/Layout'
import NochiBunny from '../components/NochiBunny'
import StampCard from '../components/StampCard'
import BadgeGrid from '../components/BadgeGrid'
import toast from 'react-hot-toast'

const TIER_META = {
  bronze: { icon: Award,  color: 'text-amber-700',  bg: 'bg-amber-700/10',  border: 'border-amber-700/30',  label: { ar: 'برونزي', en: 'Bronze' }, threshold: 0 },
  silver: { icon: Trophy, color: 'text-slate-300',  bg: 'bg-slate-300/10',  border: 'border-slate-300/30',  label: { ar: 'فضي',    en: 'Silver' }, threshold: 30 },
  gold:   { icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', label: { ar: 'ذهبي',   en: 'Gold' },   threshold: 75 },
  legend: { icon: Crown,  color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/30', label: { ar: 'أسطورة', en: 'Legend' }, threshold: 150 },
}

const TIER_RANK = { bronze: 0, silver: 1, gold: 2, legend: 3 }

// Tangible perks per tier — these show as locked/unlocked in the customer's card.
// Mechanics are honor-system at the counter for now; the visibility itself is the cult driver.
const TIER_PERKS = [
  { tier: 'silver', icon: '🎡', ar: 'اختر مزاج عجلة الحظ',         en: 'Pick your spin mood' },
  { tier: 'silver', icon: '⭐', ar: 'مكافأة عيد ميلاد مضاعفة',     en: 'Double birthday reward' },
  { tier: 'gold',   icon: '⏭️', ar: 'تخطّي الطابور — البارستا يعرفك', en: 'Skip the queue — barista knows you' },
  { tier: 'gold',   icon: '🆕', ar: 'تذوّق المشروبات الجديدة قبل الجميع', en: 'First taste of new drinks' },
  { tier: 'legend', icon: '🤝', ar: 'مشروب مجاني لصديق شهرياً',     en: 'Free drink for a friend, every month' },
  { tier: 'legend', icon: '🪪', ar: 'بطاقة Legend منقوشة باسمك',    en: 'Engraved Legend card with your name' },
  { tier: 'legend', icon: '🗳️', ar: 'صوّت على المشروب الموسمي القادم', en: 'Vote on the next seasonal drink' },
]

const NOCHI_STATE_COPY = {
  happy:    { ar: 'نوتشي سعيد بزيارتك! 🌟',                en: 'Nochi is glowing 🌟' },
  sad:      { ar: 'نوتشي يفتقدك… مرّ علينا قريباً 😢',     en: 'Nochi misses you. Come by soon 😢' },
  tired:    { ar: 'نوتشي تعب من الانتظار 😴',              en: 'Nochi is getting tired of waiting 😴' },
  deathbed: { ar: 'نوتشي على فراش المرض. لا تتركه 🛏️',    en: "Nochi is on the windowsill. Please don't forget him 🛏️" },
  dead:     { ar: 'نوتشي رحل… فرصتك الأخيرة لإحيائه 💀',   en: 'Nochi is gone… your last chance to revive him 💀' },
}

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
  const [events, setEvents] = useState([])
  const [challenges, setChallenges] = useState([])
  const [nochiNameInput, setNochiNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
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
          if (c) {
            setNochiNameInput(c.nochi_name || '')
            // Last 8 events for the timeline
            const { data: ev } = await supabase
              .from('loyalty_recent_events')
              .select('*')
              .eq('customer_id', c.id)
              .order('created_at', { ascending: false })
              .limit(8)
            setEvents(ev || [])
            // Active challenges (current period)
            const { data: ch } = await supabase
              .from('loyalty_challenges')
              .select('id, title, description, target_value, bonus_stamps, ends_at')
              .eq('is_active', true)
              .lte('starts_at', new Date().toISOString())
              .gt('ends_at', new Date().toISOString())
              .order('bonus_stamps', { ascending: false })
              .limit(4)
            setChallenges(ch || [])
          }
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

  const saveNochiName = async () => {
    if (!nochiNameInput.trim() || !card?.id) return
    setSavingName(true)
    try {
      const { error } = await supabase
        .from('loyalty_customers')
        .update({ nochi_name: nochiNameInput.trim() })
        .eq('id', card.id)
      if (error) throw error
      setCard({ ...card, nochi_name: nochiNameInput.trim() })
      toast.success(ar ? 'تم! 🐰' : 'Saved! 🐰')
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setSavingName(false)
    }
  }

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

      {/* Header with tier badge + founder pin if applicable */}
      <div className="text-center mb-4">
        <h1 className="text-white font-bold text-xl">{ar ? `أهلاً ${card.full_name}! 🐰` : `Welcome ${card.full_name}! 🐰`}</h1>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {card.tier && TIER_META[card.tier] && (() => {
            const t = TIER_META[card.tier]
            const Icon = t.icon
            return (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${t.bg} ${t.border}`}>
                <Icon size={13} className={t.color} />
                <span className={`text-xs font-bold ${t.color}`}>{t.label[ar ? 'ar' : 'en']}</span>
              </div>
            )
          })()}
          {card.is_founder && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-purple-400/40 bg-gradient-to-r from-purple-400/20 to-pink-400/20">
              <span className="text-xs font-bold text-purple-300">
                {ar ? `🏛️ مؤسس · مقعد #${card.founder_seat}` : `🏛️ Founder · seat #${card.founder_seat}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Nochi mascot + state line */}
      <div className="flex flex-col items-center mb-4">
        <NochiBunny state={card.nochi_state} size="xl" lang={lang} />
        {NOCHI_STATE_COPY[card.nochi_state] && (
          <p className="text-white text-sm font-medium mt-2 text-center max-w-xs">
            {card.nochi_name ? (
              ar
                ? NOCHI_STATE_COPY[card.nochi_state].ar.replace('نوتشي', card.nochi_name)
                : NOCHI_STATE_COPY[card.nochi_state].en.replace('Nochi', card.nochi_name)
            ) : NOCHI_STATE_COPY[card.nochi_state][ar ? 'ar' : 'en']}
          </p>
        )}
      </div>

      {/* Name your Nochi (prompt only if not set) */}
      {!card.nochi_name && (
        <div className="card mb-4 border-noch-green/30 bg-noch-green/5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-noch-green" />
            <p className="text-white text-sm font-semibold">
              {ar ? 'سمِّ نوتشي الخاص بك' : 'Name your Nochi'}
            </p>
          </div>
          <p className="text-noch-muted text-xs mb-3">
            {ar ? 'كل واحد منا له نوتشي خاص. اعطه اسماً يبقى معك.' : 'Every regular has their own Nochi. Give them a name that sticks.'}
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={ar ? 'مثلاً: فولفول، الكابتن…' : 'e.g. Bunny, Capt, Nochi Jr…'}
              value={nochiNameInput}
              onChange={e => setNochiNameInput(e.target.value)}
              maxLength={20}
            />
            <button
              onClick={saveNochiName}
              disabled={savingName || !nochiNameInput.trim()}
              className="btn-primary px-4"
            >
              {savingName ? '…' : (ar ? 'احفظ' : 'Save')}
            </button>
          </div>
        </div>
      )}

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

      {/* Tier perks — locked/unlocked based on current tier */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">✨</span>
          <p className="text-white font-semibold text-sm">{ar ? 'امتيازاتك' : 'Your perks'}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {TIER_PERKS.map((p, i) => {
            const unlocked = TIER_RANK[card.tier] >= TIER_RANK[p.tier]
            return (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
                  unlocked
                    ? 'border-noch-green/30 bg-noch-green/5'
                    : 'border-noch-border bg-noch-dark opacity-50'
                }`}
              >
                <span className="text-base">{unlocked ? p.icon : '🔒'}</span>
                <p className={`flex-1 text-xs ${unlocked ? 'text-white' : 'text-noch-muted'}`}>
                  {ar ? p.ar : p.en}
                </p>
                {!unlocked && (
                  <span className="text-[10px] text-noch-muted uppercase tracking-wider">
                    {TIER_META[p.tier].label[ar ? 'ar' : 'en']}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Active monthly challenges */}
      {challenges.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎯</span>
            <p className="text-white font-semibold text-sm">{ar ? 'تحديات الشهر' : 'This month\'s challenges'}</p>
          </div>
          <div className="flex flex-col gap-2">
            {challenges.map(c => (
              <div key={c.id} className="p-3 rounded-xl border border-noch-border bg-noch-dark">
                <p className="text-white text-sm font-medium">{c.title}</p>
                <p className="text-noch-muted text-xs mt-0.5">{c.description}</p>
                {c.bonus_stamps > 0 && (
                  <p className="text-noch-green text-[11px] mt-1 font-medium">
                    +{c.bonus_stamps} {ar ? 'طوابع إضافية' : 'bonus stamps'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badge grid */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🏅</span>
          <p className="text-white font-semibold text-sm">{ar ? 'شاراتك' : 'Your Badges'}</p>
        </div>
        <BadgeGrid customerId={card.id} />
      </div>

      {/* Memory timeline — Nochi remembers */}
      {events.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📖</span>
            <p className="text-white font-semibold text-sm">
              {card.nochi_name
                ? (ar ? `يتذكر ${card.nochi_name}` : `${card.nochi_name} remembers`)
                : (ar ? 'نوتشي يتذكر' : 'Nochi remembers')}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {events.map((e, i) => {
              const date = new Date(e.created_at)
              const dateStr = date.toLocaleDateString(ar ? 'ar-LY' : 'en-GB', { day: 'numeric', month: 'short' })
              const isStamp = e.kind === 'stamp'
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-7 text-center">
                    {isStamp ? '☕' : '🎁'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs">
                      {isStamp
                        ? (ar ? `الطابع رقم ${e.value}` : `Stamp #${e.value}`)
                        : (e.description || (ar ? 'مكافأة' : 'Reward earned'))}
                    </p>
                  </div>
                  <p className="text-noch-muted text-[11px]">{dateStr}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
