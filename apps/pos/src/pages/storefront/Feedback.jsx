import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import nochLogo from '../../assets/noch-logo.png'
// Build-safe fallbacks (these assets exist). Custom per-rating faces live in
// /public (nochi-fb-1..5.png) and override at runtime when present.
import nochiBase from '../../assets/nochi-base.png'
import nochiSad from '../../assets/nochi-sad.png'
import nochiTired from '../../assets/nochi-tired.png'
import nochiHappy from '../../assets/nochi-happy.svg'
import './styles/Feedback.css'

// Reason chips — what customers actually judge Noch on (Libyan labels).
const REASONS = [
  { key: 'drinks',      ar: 'المشروبات',       en: 'Drinks' },
  { key: 'matcha',      ar: 'الماتشا',          en: 'Matcha' },
  { key: 'food',        ar: 'الأكل والحلويات',  en: 'Food & sweets' },
  { key: 'service',     ar: 'الخدمة',           en: 'Service' },
  { key: 'cleanliness', ar: 'النظافة',          en: 'Cleanliness' },
  { key: 'price',       ar: 'الأسعار',          en: 'Price' },
  { key: 'noise',       ar: 'الهدوء والزحمة',   en: 'Noise & crowd' },
  { key: 'decor',       ar: 'الديكور',          en: 'Decor' },
]

const CUPS = [1, 2, 3, 4, 5]
const FALLBACK = { 0: nochiBase, 1: nochiSad, 2: nochiSad, 3: nochiTired, 4: nochiHappy, 5: nochiHappy }

// Nochi face that swaps per rating. Prefers the owner's custom /public faces
// (nochi-fb-N.png); on a missing file it falls back to a built-in expression.
function NochiFace({ rating }) {
  const n = rating || 0
  const initial = n >= 1 ? `/nochi-fb-${n}.png` : FALLBACK[0]
  const [src, setSrc] = useState(initial)
  useEffect(() => { setSrc(n >= 1 ? `/nochi-fb-${n}.png` : FALLBACK[0]) }, [n])
  return (
    <img
      src={src}
      onError={() => setSrc(FALLBACK[n] || nochiBase)}
      alt="Nochi"
      className="fb-nochi"
      draggable={false}
    />
  )
}

function Confetti() {
  const bits = Array.from({ length: 40 })
  const colors = ['#E86A1E', '#1E3A9F', '#7BB661', '#F4C430', '#E0529C']
  return (
    <div className="fb-confetti" aria-hidden>
      {bits.map((_, i) => (
        <span key={i} style={{
          left: `${Math.random() * 100}%`,
          background: colors[i % colors.length],
          animationDelay: `${Math.random() * 0.4}s`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }} />
      ))}
    </div>
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function Feedback() {
  const { branchId: branchParam } = useParams()
  const [params] = useSearchParams()
  const table = params.get('table')          // captured silently for the owner, never shown
  const orderId = params.get('order')
  const source = params.get('source') || 'qr'

  // The URL param can be a UUID (from QR codes) or a friendly slug (e.g.
  // "andalous"). Resolve to the real branch id; UUID resolves instantly.
  const [branchId, setBranchId] = useState(UUID_RE.test(branchParam) ? branchParam : null)

  const [lang, setLang] = useState('ar')
  const [branch, setBranch] = useState(null)
  const [step, setStep] = useState('rate')   // 'rate' | 'details' | 'done'
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [tags, setTags] = useState([])
  const [comment, setComment] = useState('')
  const [phone, setPhone] = useState('')
  const [reward, setReward] = useState(null)   // { points_awarded, total_points, reward_code }
  const [submitting, setSubmitting] = useState(false)

  const isAr = lang === 'ar'
  const t = (en, ar) => (isAr ? ar : en)

  // Suppress browser auto-translate on this customer-facing page.
  useEffect(() => {
    document.documentElement.setAttribute('lang', 'ar')
    document.documentElement.setAttribute('translate', 'no')
    return () => document.documentElement.removeAttribute('translate')
  }, [])

  useEffect(() => {
    const isUuid = UUID_RE.test(branchParam)
    const q = supabase.from('pos_branches')
      .select('id, name, review_facebook_url, review_google_url, review_instagram_url')
    ;(isUuid ? q.eq('id', branchParam) : q.ilike('slug', branchParam))
      .single()
      .then(({ data }) => { if (data) { setBranch(data); setBranchId(data.id) } })
  }, [branchParam])

  const toggleTag = (k) =>
    setTags(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const tier = rating >= 4 ? 'happy' : rating === 3 ? 'ok' : 'low'

  // Dynamic line under Nochi on the rating screen.
  const nochiLine = rating === 0 ? '' :
    rating <= 2 ? t('Nochi’s upset… what happened?', 'نوتشي متضايق… شني اللي صار؟') :
    rating === 3 ? t('We can do better… help Nochi understand', 'نقدروا نكونوا أحسن… ساعدي نوتشي يفهم شن اللي صار') :
    t('Nochi is sooo happy with you!', 'نوتشي مبسوط منك هااااالبة!')

  async function submit() {
    if (submitting || rating === 0 || !branchId) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('submit_feedback', {
        p_branch_id: branchId,
        p_rating: rating,
        p_comment: comment.trim() || null,
        p_table_number: table || null,
        p_order_id: orderId || null,
        p_source: source,
        p_emoji: rating >= 4 ? '😍' : rating === 3 ? '😐' : '😖',
        p_reason_tags: tags,
        p_phone: phone.trim() || null,
      })
      if (error) throw error
      setReward(data && data.ok ? data : null)
      setStep('done')
    } catch {
      alert(t('Could not send — please try again.', 'تعذّر الإرسال — حاولي مرة ثانية.'))
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setStep('rate'); setRating(0); setHover(0); setTags([]); setComment('')
  }

  const fb = branch?.review_facebook_url
  const google = branch?.review_google_url
  const ig = branch?.review_instagram_url || 'https://www.instagram.com/noch.libya'

  return (
    <div className="fb-root notranslate" translate="no" dir={isAr ? 'rtl' : 'ltr'}>
      <button className="fb-lang" onClick={() => setLang(l => (l === 'ar' ? 'en' : 'ar'))}>
        {isAr ? 'EN' : 'ع'}
      </button>

      <div className="fb-card">
        <img src={nochLogo} alt="Noch" className="fb-logo" />

        {/* ── STEP 1: rating ─────────────────────────────────────── */}
        {step === 'rate' && (
          <>
            <h1 className="fb-title">{t('How was your Noch?', 'كيف كانت تجربتك في نوتش؟')}</h1>
            {branch?.name && <p className="fb-sub">{branch.name}</p>}

            <div className="fb-cups" onMouseLeave={() => setHover(0)}>
              {CUPS.map(n => (
                <button
                  key={n}
                  className={`fb-cup${(hover || rating) >= n ? ' on' : ''}${rating === n ? ' picked' : ''}`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                  aria-label={`${n}`}
                >☕</button>
              ))}
            </div>

            <div className="fb-nochi-wrap">
              <NochiFace rating={rating} />
            </div>
            {nochiLine && <p className={`fb-reaction fb-${tier}`}>{nochiLine}</p>}

            {rating > 0 && (
              <button className="fb-btn-primary" onClick={() => setStep('details')}>
                {t('Continue →', 'تابعي ←')}
              </button>
            )}
          </>
        )}

        {/* ── STEP 2: details ────────────────────────────────────── */}
        {step === 'details' && (
          <>
            <div className="fb-nochi-wrap fb-nochi-sm">
              <NochiFace rating={rating} />
            </div>
            <h2 className="fb-step-title">
              {rating <= 3
                ? t('Help Nochi understand what happened', 'ساعدي نوتشي يفهم شن اللي صار')
                : t('What did you love most?', 'شن أكثر حاجة عجباتك؟')}
            </h2>

            <div className="fb-reasons">
              {REASONS.map(r => (
                <button
                  key={r.key}
                  className={`fb-chip${tags.includes(r.key) ? ' on' : ''}`}
                  onClick={() => toggleTag(r.key)}
                >
                  {isAr ? r.ar : r.en}
                </button>
              ))}
            </div>

            {rating <= 2 && (
              <div className="fb-sorry">
                <p className="fb-sorry-1">{t('Sorry to hear that — tell me more.', 'آسفين… احكيلي أكثر.')}</p>
                <p className="fb-sorry-2">{t('What ruined your experience?', 'شنو اللي نغّص عليك تجربتك وما عجبكش؟')}</p>
                <p className="fb-sorry-3">{t('I’ll take it straight to the owner, and follow up myself.', 'أنا بنوصلها مباشرة لصاحب الكافيه، وأكيد حنتابع معاه بنفسي.')}</p>
              </div>
            )}

            <textarea
              className="fb-comment"
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t('Anything else? Tell Nochi here…', 'عندك ملاحظة ثانية؟ قوليها لنوتشي هنا…')}
            />

            <p className="fb-private-note">
              {t('Pssst… between us 🤫', 'بسسست… سر بيني وبينك 🤫')}<br />
              {t('Your feedback reaches us without your name.', 'رأيك يوصلنا بدون اسمك.')}
            </p>

            {/* Optional phone → collect Nochi points (any rating; not tied to score) */}
            <div className="fb-points-box">
              <p className="fb-points-hint">🎁 {t('Drop your number to collect Nochi points', 'دخّلي رقمك تجمعي نقاط نوتشي')}</p>
              <input
                className="fb-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={20}
                placeholder={t('Phone (optional)', 'رقم الهاتف (اختياري)')}
              />
            </div>

            <button className="fb-btn-primary" disabled={submitting} onClick={submit}>
              {submitting ? t('Sending…', 'جارٍ الإرسال…') : t('Send to Nochi', 'أرسلي لنوتشي')}
            </button>
          </>
        )}

        {/* ── STEP 3: thank-you ──────────────────────────────────── */}
        {step === 'done' && (
          <div className="fb-thanks">
            {tier === 'happy' && <Confetti />}
            <div className="fb-nochi-wrap"><NochiFace rating={5} /></div>
            <h1>{t('Your message reached Nochi!', 'وصلت رسالتك لنوتشي!')}</h1>
            <p>{t('We hear you, and we always try to be better 💪', 'سمعناك، ودايمًا نحاولوا نكونوا أحسن 💪')}</p>

            {/* Free-drink voucher (threshold reached) */}
            {reward?.reward_code && (
              <div className="fb-voucher">
                <p className="fb-voucher-title">🥤 {t('You earned a FREE drink!', 'ربحتي مشروب مجاني!')}</p>
                <p className="fb-voucher-code">{reward.reward_code}</p>
                <p className="fb-voucher-note">{t('Show this code at the counter', 'وريه للكاشير عند الكاونتر')}</p>
              </div>
            )}

            {/* Nochi points earned */}
            {reward?.points_awarded > 0 && (
              <p className="fb-points-earned">
                🎁 +{reward.points_awarded} {t('Nochi points', 'نقطة نوتشي')}
                {typeof reward.total_points === 'number' && ` · ${t('total', 'المجموع')} ${reward.total_points}`}
              </p>
            )}

            {tier === 'happy' && (fb || google || ig) && (
              <div className="fb-share">
                {fb && <a className="fb-share-btn fb-fb" href={fb} target="_blank" rel="noreferrer">📘 {t('Review on Facebook', 'قيّمينا على فيسبوك')}</a>}
                {google && <a className="fb-share-btn fb-google" href={google} target="_blank" rel="noreferrer">⭐ {t('Review on Google', 'قيّمينا على جوجل')}</a>}
                {ig && <a className="fb-share-btn fb-ig" href={ig} target="_blank" rel="noreferrer">📸 {t('Follow on Instagram', 'تابعينا على إنستغرام')}</a>}
              </div>
            )}

            <a className="fb-menu-link" href={`/menu/${branchId}`}>{t('Back to menu →', '← العودة للمنيو')}</a>
          </div>
        )}
      </div>

      <p className="fb-footer">{t('Powered by Noch', 'بدعم من نوتش')} · noch.cloud</p>
    </div>
  )
}
