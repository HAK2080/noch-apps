import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import nochLogo from '../../assets/noch-logo.png'
import './styles/Feedback.css'

// Reason chips drawn from what customers actually judge Noch on (real reviews):
// ambiance, drink quality incl. matcha, cake freshness, noise/crowd, price…
const REASONS = [
  { key: 'drinks',     en: 'Drinks / Coffee', ar: 'المشروبات' },
  { key: 'matcha',     en: 'Matcha',          ar: 'الماتشا' },
  { key: 'food',       en: 'Food & Cakes',    ar: 'الأكل والكيك' },
  { key: 'ambiance',   en: 'Ambiance / Decor',ar: 'الأجواء والديكور' },
  { key: 'noise',      en: 'Noise & Crowd',   ar: 'الهدوء والزحمة' },
  { key: 'service',    en: 'Service',         ar: 'الخدمة' },
  { key: 'price',      en: 'Price',           ar: 'الأسعار' },
  { key: 'cleanliness',en: 'Cleanliness',     ar: 'النظافة' },
]

const CUPS = [1, 2, 3, 4, 5]

function Confetti() {
  // Lightweight CSS confetti — 40 colored bits.
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

export default function Feedback() {
  const { branchId } = useParams()
  const [params] = useSearchParams()
  const table = params.get('table')
  const orderId = params.get('order')
  const source = params.get('source') || 'qr'

  const [lang, setLang] = useState('ar')
  const [branch, setBranch] = useState(null)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [tags, setTags] = useState([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [already, setAlready] = useState(false)

  const isAr = lang === 'ar'
  const t = (en, ar) => (isAr ? ar : en)

  // Anti-double-submit key (per order, else per branch+table+day).
  const dedupeKey = orderId
    ? `noch-fb-${orderId}`
    : `noch-fb-${branchId}-${table || 'x'}-${new Date().toISOString().slice(0, 10)}`

  useEffect(() => {
    if (localStorage.getItem(dedupeKey)) setAlready(true)
    supabase.from('pos_branches')
      .select('name, review_facebook_url, review_google_url, review_instagram_url')
      .eq('id', branchId).single()
      .then(({ data }) => setBranch(data))
  }, [branchId, dedupeKey])

  const toggleTag = (k) =>
    setTags(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const tier = rating >= 4 ? 'happy' : rating === 3 ? 'ok' : 'low'

  async function submit() {
    if (submitting || rating === 0) return
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
      })
      if (error) throw error
      localStorage.setItem(dedupeKey, '1')
      setDone(true)
    } catch (e) {
      // Surface but don't trap the customer.
      alert(t('Could not send — please try again.', 'تعذّر الإرسال — حاول مرة أخرى.'))
    } finally {
      setSubmitting(false)
    }
  }

  // Public-review links (configured per branch, with sensible fallbacks).
  const fb = branch?.review_facebook_url
  const google = branch?.review_google_url
  const ig = branch?.review_instagram_url || 'https://www.instagram.com/noch.cafe'

  return (
    <div className="fb-root" dir={isAr ? 'rtl' : 'ltr'}>
      <button className="fb-lang" onClick={() => setLang(l => (l === 'ar' ? 'en' : 'ar'))}>
        {isAr ? 'EN' : 'ع'}
      </button>

      <div className="fb-card">
        <img src={nochLogo} alt="Noch" className="fb-logo" />

        {already && !done ? (
          <div className="fb-thanks">
            <div className="fb-mascot">🐰</div>
            <h1>{t('Already rated — thanks! 💛', 'قيّمت من قبل — شكراً! 💛')}</h1>
            <p>{t('See you soon at Noch.', 'نشوفك قريب في نوتش.')}</p>
          </div>
        ) : done ? (
          <div className="fb-thanks">
            {tier === 'happy' && <Confetti />}
            <div className="fb-mascot">{tier === 'happy' ? '🥳' : '🙏'}</div>
            <h1>{t('Thank you!', 'شكراً لك!')}</h1>
            <p>
              {tier === 'happy'
                ? t('You made Nochi’s day ☕✨', 'سعّدت نوتشي اليوم ☕✨')
                : t('We hear you — we’ll do better 💪', 'سمعناك — ونوعد نتحسّن 💪')}
            </p>

            {tier === 'happy' && (fb || google || ig) && (
              <div className="fb-share">
                <p className="fb-share-title">
                  {t('Mind sharing the love?', 'تحب تشارك رأيك للعالم؟')}
                </p>
                {fb && <a className="fb-share-btn fb-fb" href={fb} target="_blank" rel="noreferrer">📘 {t('Review on Facebook', 'قيّمنا على فيسبوك')}</a>}
                {google && <a className="fb-share-btn fb-google" href={google} target="_blank" rel="noreferrer">⭐ {t('Review on Google', 'قيّمنا على جوجل')}</a>}
                {ig && <a className="fb-share-btn fb-ig" href={ig} target="_blank" rel="noreferrer">📸 {t('Tag us on Instagram', 'تابعنا على إنستغرام')}</a>}
              </div>
            )}

            <a className="fb-menu-link" href={`/menu/${branchId}`}>
              {t('Back to menu →', 'العودة للمنيو ←')}
            </a>
          </div>
        ) : (
          <>
            <h1 className="fb-title">
              {t('How was your Noch?', 'كيف كانت تجربتك في نوتش؟')}
            </h1>
            {(branch?.name || table) && (
              <p className="fb-sub">
                {branch?.name}{table ? ` · ${t('Table', 'طاولة')} ${table}` : ''}
              </p>
            )}

            {/* Tap-to-rate cups */}
            <div className="fb-cups" onMouseLeave={() => setHover(0)}>
              {CUPS.map(n => (
                <button
                  key={n}
                  className={`fb-cup${(hover || rating) >= n ? ' on' : ''}${rating === n ? ' picked' : ''}`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => { setRating(n); if (n >= 4) setTags([]) }}
                  aria-label={`${n}`}
                >☕</button>
              ))}
            </div>

            {rating > 0 && (
              <p className={`fb-reaction fb-${tier}`}>
                {tier === 'happy'
                  ? t('Love it! ☕✨', 'حلوة! ☕✨')
                  : tier === 'ok'
                  ? t('Thanks — how can we make it great?', 'شكراً — شو نحسّن؟')
                  : t('Sorry to hear that 💔 tell us more', 'آسفين 💔 احكيلنا أكثر')}
              </p>
            )}

            {/* Low/mid score → private reason chips + comment */}
            {rating > 0 && rating <= 3 && (
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
            )}

            {rating > 0 && (
              <textarea
                className="fb-comment"
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={1000}
                placeholder={rating >= 4
                  ? t('Leave a sweet note (optional)', 'اكتب لنا كلمة حلوة (اختياري)')
                  : t('What went wrong? (optional)', 'شو اللي ما عجبك؟ (اختياري)')}
                rows={3}
              />
            )}

            {rating > 0 && rating <= 3 && (
              <p className="fb-private-note">
                🔒 {t('This goes privately to the owner, who will look into it.',
                       'تروح مباشرة لصاحب الكافيه، وراح ينظر فيها بنفسه.')}
              </p>
            )}

            <button
              className="fb-submit"
              disabled={rating === 0 || submitting}
              onClick={submit}
            >
              {submitting ? t('Sending…', 'جارٍ الإرسال…') : t('Send feedback', 'إرسال')}
            </button>
          </>
        )}
      </div>

      <p className="fb-footer">
        {t('Powered by Noch', 'بدعم من نوتش')} · noch.cloud
      </p>
    </div>
  )
}
