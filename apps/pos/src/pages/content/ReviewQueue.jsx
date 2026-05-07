// ReviewQueue.jsx — Quick-rate generated posts with emoji scoring
// Replaces 5 number sliders with 5 emoji quick-rate rows
// Self-improvement: all ratings feed the generation log

import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Eye, CheckCircle, XCircle, Edit3, Zap, RefreshCw,
  ArrowRight, BarChart3, MessageSquare,
} from 'lucide-react'
import {
  getContentPosts, updateContentPost, getBrand,
  createExperiment, createBrandMaterial,
  logPostPerformance, getPostPerformance, getAveragePerformance,
} from '../../lib/supabase'
import {
  POST_STATUSES, getStatusConfig, CONTENT_FORMATS,
  extractLesson,
} from '../../lib/contentEngine'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

// ── Score emoji tiers ─────────────────────────────────────────
const EMOJI_TIERS = [
  { emoji: '😬', score: 2, label: 'Bad' },
  { emoji: '😐', score: 4, label: 'Meh' },
  { emoji: '🙂', score: 6, label: 'OK' },
  { emoji: '😊', score: 8, label: 'Good' },
  { emoji: '🔥', score: 10, label: 'Fire' },
]

const SCORE_DIMENSIONS = [
  { key: 'voice', label: 'Voice', weight: 0.30 },
  { key: 'hook', label: 'Hook', weight: 0.25 },
  { key: 'dialect', label: 'Dialect', weight: 0.20 },
  { key: 'humor', label: 'Humor', weight: 0.15 },
  { key: 'relevance', label: 'Relevance', weight: 0.10 },
]

function EmojiScoreRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-noch-muted text-xs w-16 shrink-0">{label}</span>
      <div className="flex gap-1.5">
        {EMOJI_TIERS.map(tier => (
          <button
            key={tier.score}
            onClick={() => onChange(tier.score)}
            title={tier.label}
            className={`text-lg transition-all rounded-lg p-0.5 ${
              value === tier.score
                ? 'scale-125 ring-1 ring-noch-green'
                : 'opacity-40 hover:opacity-80 hover:scale-110'
            }`}
          >
            {tier.emoji}
          </button>
        ))}
      </div>
      {value != null && (
        <span className="text-noch-green text-xs font-bold ms-1">{value}/10</span>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = getStatusConfig(status)
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  )
}

// ── Post card ─────────────────────────────────────────────────
function PostCard({ post, brand, onApprove, onReject, onRevise, onPerformanceLogged }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [expanded, setExpanded] = useState(false)
  const [scores, setScores] = useState({
    voice: post.score_voice || null,
    dialect: post.score_dialect || null,
    hook: post.score_hook || null,
    humor: post.score_humor || null,
    relevance: post.score_relevance || null,
  })
  const [showReject, setShowReject] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRevise, setShowRevise] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [humanFeedback, setHumanFeedback] = useState(post.human_feedback || '')
  const [feedbackSaved, setFeedbackSaved] = useState(!!post.human_feedback)
  const [savingFeedback, setSavingFeedback] = useState(false)

  // Performance
  const [showPerfForm, setShowPerfForm] = useState(false)
  const [perfMetrics, setPerfMetrics] = useState({ reach: '', likes: '', comments: '', shares: '', saves: '' })
  const [existingPerf, setExistingPerf] = useState(null)
  const [savingPerf, setSavingPerf] = useState(false)

  const formatMeta = CONTENT_FORMATS.find(f => f.value === post.format)

  useEffect(() => {
    if (expanded && post.status === 'approved' && !existingPerf) {
      getPostPerformance(post.id).then(perf => {
        if (perf) {
          setExistingPerf(perf)
          setPerfMetrics({ reach: perf.reach || '', likes: perf.likes || '', comments: perf.comments || '', shares: perf.shares || '', saves: perf.saves || '' })
        }
      }).catch(() => {})
    }
  }, [expanded, post.status, post.id, existingPerf])

  const weightedTotal = SCORE_DIMENSIONS.reduce((sum, d) => {
    return sum + (scores[d.key] || 5) * d.weight
  }, 0)

  const allScored = SCORE_DIMENSIONS.every(d => scores[d.key] != null)

  async function saveFeedback() {
    if (!humanFeedback.trim()) return
    setSavingFeedback(true)
    try {
      await updateContentPost(post.id, { human_feedback: humanFeedback, human_feedback_weight: 3 })
      setFeedbackSaved(true)
      toast.success(ar ? 'تم الحفظ' : 'Feedback saved')
    } catch { toast.error('Failed') }
    finally { setSavingFeedback(false) }
  }

  return (
    <div className={`bg-noch-card border rounded-xl overflow-hidden transition-all ${
      post.status === 'approved' ? 'border-emerald-400/30' :
      post.status === 'rejected' ? 'border-red-400/20' :
      'border-noch-border hover:border-noch-green/30'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={post.status} />
            <span className="text-noch-muted text-xs">{formatMeta?.emoji} {formatMeta?.label || post.format}</span>
            <span className="text-noch-muted text-xs">· {post.platform}</span>
            <span className="text-noch-muted text-xs ms-auto">{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
          <p className="text-white text-sm font-medium line-clamp-1" dir="auto">
            {post.caption_ar || post.caption_en || 'No caption'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {post.score_total > 0 && (
            <span className="text-xs font-bold text-noch-green">{(post.score_total * 10).toFixed(0)}</span>
          )}
          <ArrowRight size={14} className={`text-noch-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-noch-border/30 pt-4 space-y-4">

          {/* Caption display */}
          {post.caption_ar && (
            <div>
              <p className="text-noch-muted text-xs mb-1">{ar ? 'النص (عربي ليبي)' : 'Arabic (Libyan) caption'}</p>
              <p dir="rtl" className="text-white text-sm whitespace-pre-line bg-noch-dark/50 rounded-lg p-3 text-right leading-relaxed">
                {post.caption_ar}
              </p>
            </div>
          )}
          {post.caption_en && (
            <div>
              <p className="text-noch-muted text-xs mb-1">English</p>
              <p className="text-white text-sm whitespace-pre-line bg-noch-dark/50 rounded-lg p-3 leading-relaxed">
                {post.caption_en}
              </p>
            </div>
          )}
          {post.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.map(h => (
                <span key={h} className="text-[11px] px-2 py-0.5 bg-noch-border/40 text-noch-muted rounded">
                  #{h.replace(/^#/, '')}
                </span>
              ))}
            </div>
          )}

          {/* Visual brief */}
          {post.visual_brief && (
            <div className="bg-blue-400/5 border border-blue-400/20 rounded-lg px-3 py-2.5">
              <p className="text-blue-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
                📷 {ar ? 'توجيه المصور / المصمم' : 'Visual Brief'}
              </p>
              <p className="text-blue-300/80 text-xs leading-relaxed">{post.visual_brief}</p>
            </div>
          )}

          {/* ── EMOJI QUICK RATE ── */}
          {['draft', 'review'].includes(post.status) && (
            <div className="bg-noch-dark/40 rounded-xl p-4">
              <h5 className="text-white text-xs font-bold mb-4">
                {ar ? 'قيّم هذا المنشور' : 'Rate this post'}
              </h5>
              <div className="space-y-3">
                {SCORE_DIMENSIONS.map(d => (
                  <EmojiScoreRow
                    key={d.key}
                    label={d.label}
                    value={scores[d.key]}
                    onChange={val => setScores(s => ({ ...s, [d.key]: val }))}
                  />
                ))}
              </div>
              {allScored && (
                <div className="mt-3 pt-3 border-t border-noch-border/30 flex items-center justify-between">
                  <span className="text-noch-muted text-xs">{ar ? 'المجموع' : 'Score'}</span>
                  <span className={`font-bold text-sm ${weightedTotal >= 8 ? 'text-emerald-400' : weightedTotal >= 6 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {(weightedTotal * 10).toFixed(0)} / 100
                    {' '}{weightedTotal >= 8 ? '🔥' : weightedTotal >= 6 ? '👍' : '❌'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Existing scores display */}
          {post.status === 'approved' && post.score_total > 0 && (
            <div className="flex gap-3 flex-wrap">
              {SCORE_DIMENSIONS.map(d => {
                const val = post[`score_${d.key}`]
                const tier = EMOJI_TIERS.find(t => t.score >= val) || EMOJI_TIERS[EMOJI_TIERS.length - 1]
                return (
                  <div key={d.key} className="flex items-center gap-1">
                    <span className="text-noch-muted text-xs">{d.label}:</span>
                    <span className="text-sm">{tier?.emoji}</span>
                    <span className="text-noch-muted text-xs">{val}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Reject / Revise forms */}
          {showReject && (
            <div>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder={ar ? 'لماذا الرفض؟ (يساعد الذكاء الاصطناعي على التعلم)' : 'Why reject? AI learns from this...'}
                className="input w-full h-16 resize-none text-sm mb-2"
                dir="auto"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowReject(false)} className="flex-1 px-3 py-2 border border-noch-border rounded-lg text-noch-muted text-xs">
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={() => onReject(post, rejectionReason, scores)}
                  className="flex-1 px-3 py-2 bg-red-500/20 text-red-400 border border-red-400/30 rounded-lg text-xs font-medium"
                >
                  {ar ? 'تأكيد الرفض' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          )}

          {showRevise && (
            <div>
              <textarea
                value={revisionNotes}
                onChange={e => setRevisionNotes(e.target.value)}
                placeholder={ar ? 'ماذا يحتاج تغيير؟' : 'What needs to change?'}
                className="input w-full h-16 resize-none text-sm mb-2"
                dir="auto"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowRevise(false)} className="flex-1 px-3 py-2 border border-noch-border rounded-lg text-noch-muted text-xs">
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={() => onRevise(post, revisionNotes, scores)}
                  className="flex-1 px-3 py-2 bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 rounded-lg text-xs font-medium"
                >
                  {ar ? 'أرسل للمراجعة' : 'Send for Revision'}
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {['draft', 'review'].includes(post.status) && !showReject && !showRevise && (
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(post, scores)}
                disabled={!allScored}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 rounded-lg text-xs font-medium hover:bg-emerald-400/20 transition-colors disabled:opacity-40 flex-1 justify-center"
              >
                <CheckCircle size={13} /> {ar ? 'قبول' : 'Approve'}
              </button>
              <button
                onClick={() => setShowRevise(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 rounded-lg text-xs font-medium hover:bg-yellow-400/20 transition-colors"
              >
                <Edit3 size={13} />
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-400/10 text-red-400 border border-red-400/30 rounded-lg text-xs font-medium hover:bg-red-400/20 transition-colors"
              >
                <XCircle size={13} />
              </button>
            </div>
          )}

          {/* Note: approve requires all 5 emoji scores */}
          {['draft', 'review'].includes(post.status) && !allScored && !showReject && !showRevise && (
            <p className="text-noch-muted text-xs text-center">
              {ar ? 'قيّم كل المحاور أولاً للموافقة' : 'Rate all 5 dimensions to approve'}
            </p>
          )}

          {/* Performance (approved posts) */}
          {post.status === 'approved' && (
            <div className="bg-noch-dark/40 rounded-xl p-4">
              <button
                onClick={() => setShowPerfForm(p => !p)}
                className="flex items-center gap-2 w-full text-left"
              >
                <BarChart3 size={14} className="text-blue-400" />
                <span className="text-white text-xs font-bold flex-1">
                  {ar ? 'سجّل الأداء الفعلي' : 'Log Real Performance'}
                </span>
                {existingPerf && <span className="text-noch-muted text-[10px]">logged</span>}
              </button>
              {showPerfForm && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {['reach', 'likes', 'comments', 'shares', 'saves'].map(key => (
                      <div key={key}>
                        <label className="text-noch-muted text-[10px] block mb-1 capitalize">{key}</label>
                        <input
                          type="number" min="0"
                          value={perfMetrics[key]}
                          onChange={e => setPerfMetrics(prev => ({ ...prev, [key]: e.target.value }))}
                          className="input w-full text-xs text-center"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      setSavingPerf(true)
                      try {
                        const metrics = {
                          post_id: post.id,
                          platform: post.platform || 'instagram',
                          reach: Number(perfMetrics.reach) || 0,
                          likes: Number(perfMetrics.likes) || 0,
                          comments: Number(perfMetrics.comments) || 0,
                          shares: Number(perfMetrics.shares) || 0,
                          saves: Number(perfMetrics.saves) || 0,
                          source_weight: 3,
                        }
                        const perf = await logPostPerformance(metrics)
                        setExistingPerf(perf)
                        await updateContentPost(post.id, {
                          performance_reach: metrics.reach,
                          performance_likes: metrics.likes,
                          performance_comments: metrics.comments,
                          performance_shares: metrics.shares,
                          performance_saves: metrics.saves,
                          performance_logged_at: new Date().toISOString(),
                        })
                        toast.success('Metrics saved!')
                        try {
                          const avg = await getAveragePerformance(brand?.id)
                          if (avg?.reach > 0 && metrics.reach > avg.reach * 2) {
                            await createBrandMaterial({
                              brand_id: brand.id,
                              type: 'caption_example',
                              title: `High performer (${metrics.reach} reach)`,
                              content: [post.caption_en, post.caption_ar].filter(Boolean).join('\n\n---\n\n'),
                              notes: `Auto-promoted. Reach: ${metrics.reach} (avg: ${Math.round(avg.reach)})`,
                            })
                            toast.success('High performer auto-saved as training material! 🏆', { duration: 4000 })
                          }
                        } catch { /* non-critical */ }
                        if (onPerformanceLogged) onPerformanceLogged()
                      } catch { toast.error('Failed to save metrics') }
                      finally { setSavingPerf(false) }
                    }}
                    disabled={savingPerf}
                    className="w-full px-3 py-2 bg-blue-400/10 text-blue-400 border border-blue-400/30 rounded-lg text-xs font-medium hover:bg-blue-400/20 transition-colors flex items-center justify-center gap-2"
                  >
                    {savingPerf ? <RefreshCw size={12} className="animate-spin" /> : <BarChart3 size={12} />}
                    {savingPerf ? 'Saving...' : existingPerf ? 'Update' : 'Save Metrics'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Human feedback */}
          <div className="pt-3 border-t border-noch-border/20">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={12} className="text-noch-muted" />
              <span className="text-noch-muted text-[10px]">
                {ar ? 'ملاحظاتك (تساعد الذكاء على التعلم)' : 'Your feedback (trains the AI)'}
              </span>
              {feedbackSaved && <span className="text-noch-green text-[10px] ms-auto">✓</span>}
            </div>
            <div className="flex gap-2">
              <input
                value={humanFeedback}
                onChange={e => { setHumanFeedback(e.target.value); setFeedbackSaved(false) }}
                placeholder={ar ? 'مثال: الهوك قوي لكن اللهجة محتاجة عمل...' : 'e.g. Hook was strong but dialect needs work...'}
                className="input flex-1 text-xs"
                dir="auto"
                onKeyDown={e => { if (e.key === 'Enter') saveFeedback() }}
              />
              <button
                onClick={saveFeedback}
                disabled={savingFeedback || !humanFeedback.trim()}
                className="px-3 py-1.5 bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg text-xs disabled:opacity-40"
              >
                {savingFeedback ? '...' : (ar ? 'حفظ' : 'Save')}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════
export default function ReviewQueue() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const brandId = searchParams.get('brand')

  const [brand, setBrand] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    if (!brandId) { navigate('/content'); return }
    getBrand(brandId).then(setBrand).catch(() => {})
    loadPosts()
  }, [brandId])

  async function loadPosts() {
    setLoading(true)
    try {
      const data = await getContentPosts(brandId)
      setPosts(data)
    } catch { toast.error('Failed to load posts') }
    finally { setLoading(false) }
  }

  async function handleApprove(post, scores) {
    const weighted = SCORE_DIMENSIONS.reduce((s, d) => s + (scores[d.key] || 5) * d.weight, 0)
    try {
      await updateContentPost(post.id, {
        status: 'approved',
        score_voice: scores.voice,
        score_dialect: scores.dialect,
        score_hook: scores.hook,
        score_humor: scores.humor,
        score_relevance: scores.relevance,
        score_total: weighted,
      })
      try {
        const lesson = extractLesson(
          { ...post, score_voice: scores.voice, score_hook: scores.hook, score_dialect: scores.dialect, score_humor: scores.humor, score_total: weighted },
          { status: 'approved' }
        )
        await createExperiment(lesson)
      } catch { /* non-critical */ }

      if (weighted >= 8.5 && brandId) {
        try {
          await createBrandMaterial({
            brand_id: brandId,
            type: 'caption_example',
            title: `Golden post (score ${(weighted * 10).toFixed(0)})`,
            content: [post.caption_en, post.caption_ar].filter(Boolean).join('\n\n---\n\n'),
            notes: `Auto-promoted. Voice:${scores.voice} Hook:${scores.hook} Dialect:${scores.dialect} Humor:${scores.humor}`,
          })
          toast.success(ar ? 'منشور ذهبي! حُفظ كمادة تدريب 🏆' : 'Golden post! Saved as training material 🏆', { duration: 4000 })
        } catch { /* non-critical */ }
      } else {
        toast.success(ar ? 'تم القبول ✓' : 'Approved ✓')
      }
      loadPosts()
    } catch { toast.error('Update failed') }
  }

  async function handleReject(post, reason, scores) {
    try {
      await updateContentPost(post.id, {
        status: 'rejected',
        rejection_reason: reason,
        score_voice: scores.voice, score_hook: scores.hook,
        score_dialect: scores.dialect, score_humor: scores.humor,
        score_relevance: scores.relevance,
      })
      try {
        await createExperiment(extractLesson(
          { ...post, ...scores },
          { status: 'rejected', rejection_reason: reason }
        ))
      } catch { /* non-critical */ }
      toast.success(ar ? 'مرفوض — الدرس محفوظ' : 'Rejected — lesson logged')
      loadPosts()
    } catch { toast.error('Update failed') }
  }

  async function handleRevise(post, notes, scores) {
    try {
      await updateContentPost(post.id, {
        status: 'draft',
        revision_notes: notes,
        score_voice: scores.voice, score_hook: scores.hook,
        score_dialect: scores.dialect, score_humor: scores.humor,
        iteration_count: (post.iteration_count || 0) + 1,
      })
      toast.success(ar ? 'أُرسل للمراجعة' : 'Sent for revision')
      loadPosts()
    } catch { toast.error('Update failed') }
  }

  const filtered = posts.filter(p => statusFilter === 'all' ? true : p.status === statusFilter)
  const counts = POST_STATUSES.reduce((acc, s) => {
    acc[s.value] = posts.filter(p => p.status === s.value).length
    return acc
  }, {})

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <button onClick={() => navigate(`/content?brand=${brandId}`)} className="text-noch-muted text-xs hover:text-white mb-1 block">
              ← {ar ? 'الاستوديو' : 'Studio'}
            </button>
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Eye size={18} className="text-yellow-400" />
              {ar ? 'مراجعة المحتوى' : 'Review Queue'}
            </h1>
            {brand && <p className="text-noch-muted text-xs mt-0.5">{brand.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/content/studio?brand=${brandId}`)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Zap size={14} /> {ar ? 'إنشاء' : 'Create'}
            </button>
            <button onClick={loadPosts} className="btn-secondary p-2">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === 'all' ? 'bg-noch-green text-noch-dark' : 'border border-noch-border text-noch-muted hover:text-white'
            }`}
          >
            {ar ? 'الكل' : 'All'} ({posts.length})
          </button>
          {POST_STATUSES.filter(s => counts[s.value] > 0).map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                statusFilter === s.value ? 'bg-noch-green text-noch-dark' : `border border-noch-border ${s.color} hover:text-white`
              }`}
            >
              {s.label} ({counts[s.value]})
            </button>
          ))}
        </div>

        {/* Posts */}
        {loading ? (
          <div className="text-center py-12 text-noch-muted">...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 card">
            <Eye size={28} className="text-noch-muted mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">
              {statusFilter === 'review' ? (ar ? 'لا يوجد محتوى للمراجعة' : 'Nothing to review') : (ar ? 'لا يوجد محتوى' : 'No posts')}
            </p>
            <p className="text-noch-muted text-sm mb-4">
              {ar ? 'ولّد محتوى جديد من الاستوديو' : 'Generate content from the Studio'}
            </p>
            <button
              onClick={() => navigate(`/content/studio?brand=${brandId}`)}
              className="btn-primary text-sm"
            >
              {ar ? 'إنشاء أول منشور' : 'Create first post'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(post => (
              <PostCard
                key={post.id}
                post={post}
                brand={brand}
                onApprove={handleApprove}
                onReject={handleReject}
                onRevise={handleRevise}
                onPerformanceLogged={loadPosts}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
