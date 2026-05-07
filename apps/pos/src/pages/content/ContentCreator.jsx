import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { PenTool, Zap, RefreshCw, Save, Copy, ChevronDown, ChevronUp, Sparkles, Star, Target, MessageSquare } from 'lucide-react'
import {
  getBrand, getBrandMaterials, getContentPost, getResearch,
  createContentPost, updateContentPost, generateContent, getSwipeFile,
  logGeneration, getGenerationLogs, updateGenerationLog,
} from '../../lib/supabase'
import {
  CONTENT_FORMATS, PLATFORMS,
  buildGenerationPrompt, generateSampleContent,
  scoreContent,
} from '../../lib/contentEngine'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

const LANGS = [
  { value: 'bilingual', label: 'Bilingual' },
  { value: 'ar', label: 'Arabic Only' },
  { value: 'en', label: 'English Only' },
]

function Slider({ label, value, onChange, min = 1, max = 5 }) {
  const labels = { 1: 'Low', 3: 'Mid', 5: 'High' }
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-noch-muted">{label}</span>
        <span className="text-noch-green font-bold">{value}/5</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-noch-border accent-noch-green"
      />
      <div className="flex justify-between text-[10px] text-noch-muted mt-0.5">
        {Object.entries(labels).map(([k, v]) => <span key={k}>{v}</span>)}
      </div>
    </div>
  )
}

function ScoreBadge({ label, score }) {
  const color = score >= 8 ? 'text-emerald-400 bg-emerald-400/10' : score >= 6 ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${color}`}>
      <span className="text-xs">{label}</span>
      <span className="text-xs font-bold">{score?.toFixed(1) || '—'}/10</span>
    </div>
  )
}

export default function ContentCreator() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isOwner } = useAuth()
  const brandId = searchParams.get('brand')
  const researchId = searchParams.get('research')
  const postId = searchParams.get('post')

  const [brand, setBrand] = useState(null)
  const [materials, setMaterials] = useState([])
  const [research, setResearch] = useState(null)
  const [swipeEntries, setSwipeEntries] = useState([])
  const [selectedSwipe, setSelectedSwipe] = useState([]) // IDs of swipe entries to inject
  const [showInspiration, setShowInspiration] = useState(false)

  // Config
  const [format, setFormat] = useState('static')
  const [platform, setPlatform] = useState('instagram')
  const [language, setLanguage] = useState('bilingual')
  const [chaosLevel, setChaosLevel] = useState(3)
  const [humorLevel, setHumorLevel] = useState(3)
  const [localDensity, setLocalDensity] = useState(4)
  const [brief, setBrief] = useState('')

  // Output — batch: array of variations
  const [variations, setVariations] = useState([])
  const [selectedVariation, setSelectedVariation] = useState(0)
  const [result, setResult] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')
  const [genError, setGenError] = useState(null) // edge function error
  const [feedback, setFeedback] = useState(null) // null | 'use' | 'minor' | 'major' | 'potential' | 'rubbish'
  const [feedbackNote, setFeedbackNote] = useState('')
  const [currentGenLogId, setCurrentGenLogId] = useState(null)

  // Sweet spot
  const [sweetSpot, setSweetSpot] = useState(null)
  const [sweetSpotCount, setSweetSpotCount] = useState(0)

  // Editing
  const [editEn, setEditEn] = useState('')
  const [editAr, setEditAr] = useState('')
  const [editBrief, setEditBrief] = useState('')
  const [editHashtags, setEditHashtags] = useState('')

  useEffect(() => {
    if (!brandId) { navigate('/content'); return }
    getBrand(brandId).then(setBrand)
    getBrandMaterials(brandId).then(setMaterials).catch(() => {})
    getSwipeFile(brandId, { is_curated: false }).then(setSwipeEntries).catch(() => {})
    if (researchId) {
      getResearch(researchId).then(r => {
        setResearch(r)
        if (r.insight) setBrief(r.insight)
      }).catch(() => {})
    }
    // Load generation logs for sweet spot calculation
    getGenerationLogs(brandId, 50).then(logs => {
      if (!logs || logs.length < 10) return
      // Group by config combo (chaos, humor, local)
      const groups = {}
      logs.forEach(log => {
        const cfg = log.config_json
        if (!cfg) return
        const key = `${cfg.chaosLevel || 3}-${cfg.humorLevel || 3}-${cfg.localDensity || 4}`
        if (!groups[key]) groups[key] = { chaos: cfg.chaosLevel || 3, humor: cfg.humorLevel || 3, local: cfg.localDensity || 4, scores: [] }
        if (log.score_total) groups[key].scores.push(log.score_total)
      })
      // Find best combo with at least 2 data points
      let best = null
      let bestAvg = 0
      Object.values(groups).forEach(g => {
        if (g.scores.length < 2) return
        const avg = g.scores.reduce((a, b) => a + b, 0) / g.scores.length
        if (avg > bestAvg) { bestAvg = avg; best = g }
      })
      if (best) {
        setSweetSpot({ chaos: best.chaos, humor: best.humor, local: best.local, avgScore: bestAvg })
        setSweetSpotCount(logs.length)
      }
    }).catch(() => {})
  }, [brandId, researchId])

  async function generate() {
    if (!brand) return
    setGenerating(true)
    setGenError(null)
    setFeedback(null)

    const config = { format, platform, language, chaosLevel, humorLevel, localDensity, brief }
    const inspirationEntries = swipeEntries
      .filter(s => selectedSwipe.includes(s.id))
      .map(s => ({ caption_text: s.caption_text, source_platform: s.source_platform, why_relevant: s.why_relevant }))

    try {
      const edgeResult = await generateContent(brand, research, config, inspirationEntries, 3)
      let output
      if (edgeResult?.variations?.length) {
        setVariations(edgeResult.variations)
        output = edgeResult.variations[0]
      } else if (edgeResult?.data) {
        output = edgeResult.data
        setVariations([edgeResult.data])
      } else {
        throw new Error('Empty response from Claude')
      }
      setResult(output)
      setSelectedVariation(0)
      setEditEn(output.caption_en || '')
      setEditAr(output.caption_ar || '')
      setEditBrief(output.image_brief || '')
      setEditHashtags((output.hashtags || []).join(', '))
      toast.success(edgeResult?.variations?.length > 1 ? `${edgeResult.variations.length} variations generated!` : 'Generated!')

      // Log generation to generation_log
      try {
        const scores = scoreContent({ caption_en: output.caption_en, caption_ar: output.caption_ar }, brand)
        const genLog = await logGeneration({
          brand_id: brandId,
          config_json: config,
          research_id: researchId || null,
          swipe_ids: selectedSwipe.length > 0 ? selectedSwipe : null,
          result_json: output,
          score_total: scores.total,
          score_breakdown: { voice: scores.voice, hook: scores.hook, dialect: scores.dialect, humor: scores.humor, relevance: scores.relevance },
        })
        setCurrentGenLogId(genLog.id)
      } catch { /* silent — generation log is non-critical */ }
    } catch (e) {
      // Show error prominently — do NOT silently fall back
      const msg = e.message || 'Unknown error'
      setGenError(msg)
      toast.error('Generation failed — see error below')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave(status = 'draft') {
    if (!result) return
    setSaving(true)
    try {
      const scores = scoreContent({ caption_en: editEn, caption_ar: editAr }, brand)
      const payload = {
        brand_id: brandId,
        research_id: researchId || null,
        format,
        platform,
        caption_en: editEn,
        caption_ar: editAr,
        image_brief: editBrief,
        hashtags: editHashtags.split(',').map(h => h.trim()).filter(Boolean),
        cta: result.cta,
        generation_prompt: lastPrompt,
        status,
        score_voice: scores.voice,
        score_hook: scores.hook,
        score_dialect: scores.dialect,
        score_humor: scores.humor,
        score_relevance: scores.relevance,
        score_total: scores.total,
      }
      await createContentPost(payload)
      toast.success(status === 'review' ? 'Sent to review queue!' : 'Saved as draft')
      navigate(`/content/review?brand=${brandId}`)
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
    toast.success('Copied!')
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">

        <div className="mb-6">
          <button onClick={() => navigate('/content')} className="text-noch-muted text-xs hover:text-white mb-1 block">← Content Studio</button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <PenTool size={20} className="text-noch-green" /> Content Creator
          </h1>
          {brand && <p className="text-noch-muted text-sm">{brand.name} · {brand.voice_archetype}</p>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Config panel */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h3 className="text-white font-semibold text-sm mb-4">Post Settings</h3>

              <div className="space-y-4">
                {/* Format */}
                <div>
                  <label className="text-noch-muted text-xs mb-2 block">Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CONTENT_FORMATS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => setFormat(f.value)}
                        className={`px-2 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                          format === f.value
                            ? 'bg-noch-green text-noch-dark'
                            : 'border border-noch-border text-noch-muted hover:border-noch-green/30 hover:text-white'
                        }`}
                      >
                        {f.emoji} {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Platform */}
                <div>
                  <label className="text-noch-muted text-xs mb-2 block">Platform</label>
                  <div className="flex gap-2 flex-wrap">
                    {PLATFORMS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => setPlatform(p.value)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          platform === p.value
                            ? 'bg-noch-green text-noch-dark'
                            : 'border border-noch-border text-noch-muted hover:text-white'
                        }`}
                      >
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div>
                  <label className="text-noch-muted text-xs mb-2 block">Language</label>
                  <div className="flex gap-2">
                    {LANGS.map(l => (
                      <button
                        key={l.value}
                        onClick={() => setLanguage(l.value)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          language === l.value
                            ? 'bg-noch-green text-noch-dark'
                            : 'border border-noch-border text-noch-muted hover:text-white'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sweet spot banner */}
                {sweetSpot && (
                  <div className="bg-noch-green/10 border border-noch-green/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Target size={12} className="text-noch-green" />
                      <span className="text-noch-green text-xs font-semibold">Sweet spot based on {sweetSpotCount} generations</span>
                    </div>
                    <p className="text-white text-xs">
                      Chaos {sweetSpot.chaos}, Humor {sweetSpot.humor}, Local {sweetSpot.local}
                      <span className="text-noch-muted ml-1">(avg score {sweetSpot.avgScore.toFixed(1)})</span>
                    </p>
                    <button
                      onClick={() => {
                        setChaosLevel(sweetSpot.chaos)
                        setHumorLevel(sweetSpot.humor)
                        setLocalDensity(sweetSpot.local)
                        toast.success('Sweet spot applied!')
                      }}
                      className="mt-2 text-xs px-3 py-1 bg-noch-green text-noch-dark rounded-lg font-semibold hover:bg-noch-green/90 transition-colors"
                    >
                      Use sweet spot
                    </button>
                  </div>
                )}

                {/* Sliders */}
                <Slider label="Chaos Level" value={chaosLevel} onChange={setChaosLevel} />
                <Slider label="Humor Intensity" value={humorLevel} onChange={setHumorLevel} />
                <Slider label="Local (Tripoli) Density" value={localDensity} onChange={setLocalDensity} />

                {/* Brief */}
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Brief / Context (optional)</label>
                  <textarea
                    value={brief}
                    onChange={e => setBrief(e.target.value)}
                    placeholder="Seasonal drink, event, trending topic..."
                    className="input w-full h-16 resize-none text-sm"
                  />
                </div>
              </div>

              <button
                onClick={generate}
                disabled={generating || !brand}
                className="w-full btn-primary mt-5 flex items-center justify-center gap-2"
              >
                {generating ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                {generating ? 'Generating...' : 'Generate Content'}
              </button>
            </div>

            {/* Inspiration from Swipe File */}
            {swipeEntries.length > 0 && (
              <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowInspiration(i => !i)}
                  className="w-full flex items-center justify-between px-5 py-3 text-xs hover:bg-noch-border/20 transition-colors"
                >
                  <span className="flex items-center gap-2 text-noch-green font-semibold">
                    <Sparkles size={13} /> Inspiration ({swipeEntries.length})
                  </span>
                  {showInspiration ? <ChevronUp size={13} className="text-noch-muted" /> : <ChevronDown size={13} className="text-noch-muted" />}
                </button>
                {showInspiration && (
                  <div className="px-4 pb-4 space-y-2 max-h-64 overflow-auto">
                    <p className="text-noch-muted text-[10px]">Select posts to inject as voice reference</p>
                    {swipeEntries.slice(0, 10).map(s => (
                      <label
                        key={s.id}
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                          selectedSwipe.includes(s.id) ? 'bg-noch-green/10 border border-noch-green/30' : 'bg-noch-dark/30 border border-transparent hover:border-noch-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSwipe.includes(s.id)}
                          onChange={() => setSelectedSwipe(prev =>
                            prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                          )}
                          className="mt-1 accent-noch-green"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs line-clamp-2">{s.caption_text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-noch-muted">{s.source_platform}</span>
                            {s.voice_similarity_score > 0 && (
                              <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                                <Star size={8} fill="currentColor" /> {s.voice_similarity_score}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Research context */}
            {research && (
              <div className="bg-noch-card border border-blue-400/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-blue-400 text-xs font-semibold">Research context loaded</span>
                </div>
                <p className="text-white text-xs">{research.source_title}</p>
                {research.insight && <p className="text-noch-green text-xs mt-1">💡 {research.insight}</p>}
              </div>
            )}
          </div>

          {/* Output panel */}
          <div className="lg:col-span-3 space-y-4">
            {/* Generation error */}
            {genError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-xs font-bold mb-1">Generation failed</p>
                <p className="text-red-300 text-xs font-mono">{genError}</p>
                {genError.includes('JWT') && (
                  <p className="text-noch-muted text-xs mt-2">Try refreshing the page or logging out and back in.</p>
                )}
              </div>
            )}
            {!result ? (
              <div className="bg-noch-card border border-dashed border-noch-border rounded-xl p-10 text-center">
                <Zap size={28} className="text-noch-muted mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-1">Ready to generate</h3>
                <p className="text-noch-muted text-sm">Configure settings and hit Generate</p>
              </div>
            ) : (
              <>
                {/* Variation selector */}
                {variations.length > 1 && (
                  <div className="bg-noch-card border border-noch-border rounded-xl p-4">
                    <p className="text-noch-muted text-xs mb-2">Pick a variation ({variations.length} generated)</p>
                    <div className="flex gap-2 flex-wrap">
                      {variations.map((v, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSelectedVariation(i)
                            setResult(v)
                            setEditEn(v.caption_en || '')
                            setEditAr(v.caption_ar || '')
                            setEditBrief(v.image_brief || '')
                            setEditHashtags((v.hashtags || []).join(', '))
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            selectedVariation === i
                              ? 'bg-noch-green text-noch-dark'
                              : 'border border-noch-border text-noch-muted hover:text-white'
                          }`}
                        >
                          #{i + 1} {v.voice_score_estimate && `(${v.voice_score_estimate}/10)`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* English caption */}
                {(language === 'en' || language === 'bilingual') && (
                  <div className="bg-noch-card border border-noch-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-white font-semibold text-sm">English Caption</h4>
                      <button onClick={() => copyToClipboard(editEn)} className="text-noch-muted hover:text-white transition-colors">
                        <Copy size={14} />
                      </button>
                    </div>
                    <textarea
                      value={editEn}
                      onChange={e => setEditEn(e.target.value)}
                      className="input w-full h-28 resize-none text-sm font-mono"
                    />
                  </div>
                )}

                {/* Arabic caption */}
                {(language === 'ar' || language === 'bilingual') && (
                  <div className="bg-noch-card border border-noch-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-white font-semibold text-sm">Arabic Caption (Tripoli dialect)</h4>
                      <button onClick={() => copyToClipboard(editAr)} className="text-noch-muted hover:text-white transition-colors">
                        <Copy size={14} />
                      </button>
                    </div>
                    <textarea
                      dir="rtl"
                      value={editAr}
                      onChange={e => setEditAr(e.target.value)}
                      className="input w-full h-28 resize-none text-sm font-mono text-right"
                    />
                    {result.dialect_notes && (
                      <p className="text-noch-muted text-xs mt-2">🗣️ {result.dialect_notes}</p>
                    )}
                  </div>
                )}

                {/* Image brief */}
                <div className="bg-noch-card border border-noch-border rounded-xl p-5">
                  <h4 className="text-white font-semibold text-sm mb-3">Visual Brief</h4>
                  <textarea
                    value={editBrief}
                    onChange={e => setEditBrief(e.target.value)}
                    className="input w-full h-16 resize-none text-sm"
                  />
                </div>

                {/* Hashtags */}
                <div className="bg-noch-card border border-noch-border rounded-xl p-5">
                  <h4 className="text-white font-semibold text-sm mb-3">Hashtags</h4>
                  <input
                    value={editHashtags}
                    onChange={e => setEditHashtags(e.target.value)}
                    className="input w-full text-sm"
                    placeholder="#noch, #طرابلس..."
                  />
                </div>

                {/* Scores */}
                {result && (
                  <div className="bg-noch-card border border-noch-border rounded-xl p-5">
                    <h4 className="text-white font-semibold text-sm mb-3">Auto Scores (rough)</h4>
                    <div className="space-y-2">
                      {(() => {
                        const s = scoreContent({ caption_en: editEn, caption_ar: editAr }, brand)
                        return (
                          <>
                            <ScoreBadge label="Voice" score={s.voice} />
                            <ScoreBadge label="Hook" score={s.hook} />
                            <ScoreBadge label="Dialect" score={s.dialect} />
                            <ScoreBadge label="Humor" score={s.humor} />
                            <div className="border-t border-noch-border/30 pt-2 mt-2">
                              <ScoreBadge label="Total (weighted)" score={s.total} />
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    <p className="text-noch-muted text-[10px] mt-2">Human scores in Review Queue override these</p>
                  </div>
                )}

                {/* Prompt debug */}
                {lastPrompt && (
                  <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowPrompt(p => !p)}
                      className="w-full flex items-center justify-between px-5 py-3 text-xs text-noch-muted hover:text-white transition-colors"
                    >
                      <span>View generation prompt</span>
                      {showPrompt ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {showPrompt && (
                      <pre className="px-5 pb-4 text-[10px] text-noch-muted overflow-auto max-h-40 whitespace-pre-wrap">
                        {lastPrompt}
                      </pre>
                    )}
                  </div>
                )}

                {/* Quick Feedback */}
                <div className="bg-noch-card border border-noch-border rounded-xl p-5">
                  <h4 className="text-white font-semibold text-sm mb-3">Quick Feedback</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'use',       emoji: '🔥', label: 'Use it',          desc: 'Send straight to review',   color: 'border-noch-green/40 hover:bg-noch-green/10 text-noch-green',   action: () => handleSave('review') },
                      { id: 'minor',     emoji: '✏️', label: 'Minor tweaks',    desc: 'Good base, needs polish',   color: 'border-yellow-400/40 hover:bg-yellow-400/10 text-yellow-400', action: null },
                      { id: 'major',     emoji: '🔧', label: 'Major tweaks',    desc: 'Right direction, wrong exec', color: 'border-orange-400/40 hover:bg-orange-400/10 text-orange-400', action: null },
                      { id: 'potential', emoji: '💡', label: 'Has potential',   desc: 'Save as draft, revisit',    color: 'border-blue-400/40 hover:bg-blue-400/10 text-blue-400',     action: () => handleSave('draft') },
                      { id: 'rubbish',   emoji: '🗑️', label: 'Total rubbish',  desc: 'Discard and regenerate',    color: 'border-red-400/40 hover:bg-red-400/10 text-red-400',        action: () => { setResult(null); setVariations([]); setFeedback(null); setFeedbackNote(''); setCurrentGenLogId(null); generate() } },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        disabled={saving}
                        onClick={() => {
                          setFeedback(opt.id)
                          if (opt.action) opt.action()
                        }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          feedback === opt.id
                            ? opt.color + ' bg-opacity-20'
                            : 'border-noch-border text-noch-muted hover:text-white'
                        } ${opt.color}`}
                      >
                        <span className="text-lg leading-none">{opt.emoji}</span>
                        <div className="flex-1">
                          <span className="font-semibold text-sm block">{opt.label}</span>
                          <span className="text-xs opacity-70">{opt.desc}</span>
                        </div>
                        {feedback === opt.id && <span className="text-xs font-bold">✓</span>}
                      </button>
                    ))}
                  </div>

                  {/* Human feedback note — shown after selecting a feedback option */}
                  {feedback && currentGenLogId && (
                    <div className="mt-4 pt-4 border-t border-noch-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={12} className="text-noch-muted" />
                        <span className="text-noch-muted text-xs">Quick note (optional — helps AI learn faster)</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={feedbackNote}
                          onChange={e => setFeedbackNote(e.target.value)}
                          placeholder="e.g. Hook was weak, dialect felt off..."
                          className="input flex-1 text-sm"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && feedbackNote.trim()) {
                              updateGenerationLog(currentGenLogId, {
                                feedback: `[${feedback}] ${feedbackNote}`,
                                feedback_weight: 3,
                                was_approved: feedback === 'use',
                              }).then(() => toast.success('Feedback saved!')).catch(() => toast.error('Failed to save'))
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            updateGenerationLog(currentGenLogId, {
                              feedback: `[${feedback}]${feedbackNote ? ' ' + feedbackNote : ''}`,
                              feedback_weight: 3,
                              was_approved: feedback === 'use',
                            }).then(() => toast.success('Feedback saved!')).catch(() => toast.error('Failed to save'))
                          }}
                          className="px-3 py-1.5 bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg text-xs font-medium hover:bg-noch-green/20 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
