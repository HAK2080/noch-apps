// Studio.jsx — Intent-first content generation
// Screen 2: Pick intent → set format/platform → stream → act
// No edge functions. Direct Anthropic API. Real quality.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Check, Edit3, Zap, ChevronRight } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import Layout from '../../components/Layout'
import {
  generatePostStream, generateVariantsStream, parseVariants, extractJSON,
  INTENTS, PLATFORMS, FORMATS,
} from '../../lib/claudeClient'
import { getBrand, createContentPost, logGeneration, getContentSeries, incrementSeriesPostCount } from '../../lib/supabase'
import toast from 'react-hot-toast'

// ── Phase indicators ──────────────────────────────────────────
const PHASES = {
  INTENT: 'intent',
  OPTIONS: 'options',
  GENERATING: 'generating',
  RESULT: 'result',
}

// ── Blinking cursor component ─────────────────────────────────
function Cursor() {
  return <span className="inline-block w-0.5 h-4 bg-noch-green ml-0.5 animate-pulse align-middle" />
}

// ── Result display ─────────────────────────────────────────────
function ResultBlock({ result, rawText, onUse, onRegenerate, onEdit, saving, lang }) {
  const ar = lang === 'ar'

  if (!result && rawText) {
    // Still streaming — show raw text with cursor
    return (
      <div className="card font-mono text-sm text-white/80 whitespace-pre-wrap leading-relaxed min-h-[120px]">
        {rawText}
        <Cursor />
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="flex flex-col gap-4">
      {/* Main caption */}
      <div className="card">
        <p className="text-noch-muted text-xs mb-2">{ar ? 'النص الرئيسي' : 'Caption'}</p>
        <p
          className="text-white text-base leading-relaxed whitespace-pre-wrap"
          dir={result.caption_ar ? 'rtl' : 'ltr'}
        >
          {result.caption_ar || result.caption_en || '—'}
        </p>

        {result.caption_en && result.caption_ar && (
          <div className="mt-3 pt-3 border-t border-noch-border">
            <p className="text-noch-muted text-xs mb-1">English version</p>
            <p className="text-white/70 text-sm leading-relaxed">{result.caption_en}</p>
          </div>
        )}
      </div>

      {/* Hashtags */}
      {result.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.hashtags.map(tag => (
            <span key={tag} className="text-xs bg-noch-green/10 text-noch-green px-2 py-0.5 rounded-full font-mono">
              #{tag.replace(/^#/, '')}
            </span>
          ))}
        </div>
      )}

      {/* Visual brief — for photographer/designer */}
      {result.visual_brief && (
        <div className="bg-blue-400/5 border border-blue-400/20 rounded-lg px-4 py-3">
          <p className="text-blue-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
            📷 {lang === 'ar' ? 'توجيه المصور / المصمم' : 'Visual Brief'}
          </p>
          <p className="text-blue-300/80 text-xs leading-relaxed">{result.visual_brief}</p>
        </div>
      )}

      {/* Creative note */}
      {result.notes && (
        <div className="bg-noch-border/20 rounded-lg px-4 py-3">
          <p className="text-noch-muted text-xs">{result.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onUse}
          disabled={saving}
          className="btn-primary flex items-center gap-2 flex-1 justify-center"
        >
          <Check size={16} />
          {saving ? '...' : (ar ? 'استخدم هذا' : 'Use This')}
        </button>
        <button
          onClick={onRegenerate}
          className="btn-secondary p-2.5"
          title={ar ? 'أعد التوليد' : 'Regenerate'}
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={onEdit}
          className="btn-secondary p-2.5"
          title={ar ? 'عدّل قبل الحفظ' : 'Edit before saving'}
        >
          <Edit3 size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Main Studio Page ───────────────────────────────────────────
export default function Studio() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const brandId = searchParams.get('brand')

  // Phase state
  const [phase, setPhase] = useState(PHASES.INTENT)
  const [selectedIntent, setSelectedIntent] = useState(null)
  const [selectedPlatform, setSelectedPlatform] = useState('instagram')
  const [selectedFormat, setSelectedFormat] = useState('caption')
  const [selectedLanguage, setSelectedLanguage] = useState('bilingual')
  const [context, setContext] = useState('')

  // Generation state
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState(null)
  const [variants, setVariants] = useState(null) // array of 3
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [variantsMode, setVariantsMode] = useState(true) // default: 3 variants
  const [saving, setSaving] = useState(false)
  const [brand, setBrand] = useState(null)
  const [logId, setLogId] = useState(null)

  // Series
  const [selectedSeries, setSelectedSeries] = useState('')
  const [seriesList, setSeriesList] = useState([])

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editedCaption, setEditedCaption] = useState('')

  const abortRef = useRef(false)

  // Load brand and series on mount
  useEffect(() => {
    if (brandId) {
      getBrand(brandId).then(setBrand).catch(() => {})
      getContentSeries(brandId).then(s => setSeriesList(s.filter(x => x.is_active))).catch(() => {})
    }
  }, [brandId])

  // ── Select intent → go to options ──
  const handleSelectIntent = (intent) => {
    setSelectedIntent(intent)
    setPhase(PHASES.OPTIONS)
  }

  // ── Start generation ──
  const handleGenerate = useCallback(async () => {
    if (!selectedIntent) return

    setPhase(PHASES.GENERATING)
    setRawText('')
    setResult(null)
    setVariants(null)
    setSelectedVariant(0)
    setEditMode(false)
    abortRef.current = false

    let fullText = ''
    const startTime = Date.now()

    try {
      // Include series template hint in context if series selected
      const activeSeries = seriesList.find(s => s.id === selectedSeries)
      const fullContext = activeSeries?.template_hint
        ? `[Series: ${activeSeries.name}] ${activeSeries.template_hint}\n\n${context}`
        : context

      const streamGen = variantsMode
        ? generateVariantsStream({
            brand,
            intent: selectedIntent.id,
            format: selectedFormat,
            platform: selectedPlatform,
            language: selectedLanguage,
            context: fullContext,
          })
        : generatePostStream({
            brand,
            intent: selectedIntent.id,
            format: selectedFormat,
            platform: selectedPlatform,
            language: selectedLanguage,
            context: fullContext,
          })

      for await (const chunk of streamGen) {
        if (abortRef.current) break
        fullText += chunk
        setRawText(fullText)
      }

      if (variantsMode) {
        // Parse variants array
        const parsedVariants = parseVariants(fullText)
        if (parsedVariants && parsedVariants.length > 0) {
          setVariants(parsedVariants)
          setResult(parsedVariants[0])
        } else {
          // Fallback: treat as single
          const parsed = extractJSON(fullText)
          setResult(parsed || { caption_ar: fullText, caption_en: null, hashtags: [], notes: '' })
        }
      } else {
        // Parse single result
        const parsed = extractJSON(fullText)
        if (parsed) {
          setResult(parsed)
        } else {
          setResult({ caption_ar: fullText, caption_en: null, hashtags: [], notes: '' })
        }
      }

      setPhase(PHASES.RESULT)

      // Log generation
      try {
        const log = await logGeneration({
          brand_id: brandId,
          intent: selectedIntent.id,
          format: selectedFormat,
          platform: selectedPlatform,
          output_ar: parsed?.caption_ar || fullText,
          output_en: parsed?.caption_en || null,
          generation_time_ms: Date.now() - startTime,
          model: 'claude-sonnet-4-6',
        })
        setLogId(log?.id)
      } catch { /* non-critical */ }

    } catch (err) {
      toast.error(err.message || (ar ? 'خطأ في التوليد' : 'Generation failed'))
      setPhase(PHASES.OPTIONS)
    }
  }, [brand, selectedIntent, selectedFormat, selectedPlatform, selectedLanguage, context, brandId, ar, variantsMode, seriesList, selectedSeries])

  // ── Save post ──
  const handleUse = async () => {
    const activeResult = variants ? variants[selectedVariant] : result
    if (!activeResult) return
    setSaving(true)
    try {
      const caption = editMode ? editedCaption : (activeResult.caption_ar || activeResult.caption_en)
      await createContentPost({
        brand_id: brandId,
        caption_ar: editMode ? editedCaption : activeResult.caption_ar,
        caption_en: activeResult.caption_en,
        format: selectedFormat,
        platform: selectedPlatform,
        status: 'draft',
        hashtags: activeResult.hashtags || [],
        visual_brief: activeResult.visual_brief || null,
        notes: activeResult.notes || null,
      })
      // Increment series count if a series was selected
      if (selectedSeries) {
        incrementSeriesPostCount(selectedSeries).catch(() => {})
      }
      toast.success(ar ? 'تم الحفظ كمسودة ✓' : 'Saved as draft ✓')
      navigate(`/content/review?brand=${brandId}`)
    } catch (err) {
      toast.error(err.message || (ar ? 'خطأ في الحفظ' : 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  // ── Edit mode ──
  const handleEdit = () => {
    const activeResult = variants ? variants[selectedVariant] : result
    setEditedCaption(activeResult?.caption_ar || activeResult?.caption_en || '')
    setEditMode(true)
  }

  // ── Back ──
  const handleBack = () => {
    if (phase === PHASES.OPTIONS || phase === PHASES.INTENT) {
      navigate(`/content?brand=${brandId}`)
    } else if (phase === PHASES.GENERATING) {
      abortRef.current = true
      setPhase(PHASES.OPTIONS)
    } else {
      setPhase(PHASES.OPTIONS)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER — Phase A: Intent selection
  // ═══════════════════════════════════════════════════════════
  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={handleBack} className="p-2 text-noch-muted hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            <Zap size={18} className="text-noch-green" />
            {ar ? 'إنشاء محتوى' : 'Create Content'}
          </h1>
          {brand && <p className="text-noch-muted text-xs">{brand.name}</p>}
        </div>

        {/* Phase dots */}
        <div className="ms-auto flex items-center gap-1.5">
          {Object.values(PHASES).map((p, i) => (
            <div
              key={p}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                phase === p ? 'bg-noch-green w-3' :
                Object.values(PHASES).indexOf(phase) > i ? 'bg-noch-green/40' : 'bg-noch-border'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── PHASE: INTENT ── */}
      {phase === PHASES.INTENT && (
        <div>
          <p className="text-noch-muted text-sm mb-5">
            {ar ? 'ما هو هدف المحتوى؟' : 'What is the purpose of this post?'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {INTENTS.map(intent => (
              <button
                key={intent.id}
                onClick={() => handleSelectIntent(intent)}
                className="group bg-noch-card border border-noch-border rounded-xl p-4 text-left hover:border-noch-green/40 transition-all hover:shadow-lg active:scale-95"
              >
                <div className="text-2xl mb-2">{intent.emoji}</div>
                <h3 className="text-white font-semibold text-sm mb-1">
                  {ar ? intent.labelAr : intent.label}
                </h3>
                <p className="text-noch-muted text-xs leading-relaxed">
                  {ar ? intent.descAr : intent.desc}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── PHASE: OPTIONS ── */}
      {phase === PHASES.OPTIONS && selectedIntent && (
        <div className="flex flex-col gap-5">
          {/* Intent reminder */}
          <div className="flex items-center gap-3 bg-noch-green/10 border border-noch-green/20 rounded-xl px-4 py-3">
            <span className="text-xl">{selectedIntent.emoji}</span>
            <div className="flex-1">
              <p className="text-noch-green font-semibold text-sm">
                {ar ? selectedIntent.labelAr : selectedIntent.label}
              </p>
            </div>
            <button
              onClick={() => setPhase(PHASES.INTENT)}
              className="text-noch-muted hover:text-white text-xs transition-colors"
            >
              {ar ? 'غيّر' : 'Change'}
            </button>
          </div>

          {/* Platform */}
          <div>
            <label className="label">{ar ? 'المنصة' : 'Platform'}</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlatform(p.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedPlatform === p.id
                      ? 'bg-noch-green text-noch-dark'
                      : 'border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white'
                  }`}
                >
                  <span>{p.emoji}</span> {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="label">{ar ? 'الصيغة' : 'Format'}</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFormat(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedFormat === f.id
                      ? 'bg-noch-green text-noch-dark'
                      : 'border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white'
                  }`}
                >
                  <span>{f.emoji}</span> {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="label">{ar ? 'اللغة' : 'Language'}</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {[
                { id: 'ar', label: 'عربي ليبي (طرابلس)', emoji: '🇱🇾' },
                { id: 'bilingual', label: 'عربي + English', emoji: '🔀' },
                { id: 'en', label: 'English', emoji: '🇬🇧' },
              ].map(l => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLanguage(l.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedLanguage === l.id
                      ? 'bg-noch-green text-noch-dark'
                      : 'border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white'
                  }`}
                >
                  <span>{l.emoji}</span> {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Context (optional) */}
          <div>
            <label className="label">
              {ar ? 'سياق إضافي (اختياري)' : 'Additional context (optional)'}
            </label>
            <textarea
              className="input resize-none h-20 text-sm"
              placeholder={ar ? 'مثال: إطلاق ماتشا جديد، عرض الجمعة...' : 'e.g. new matcha launch, Friday special...'}
              value={context}
              onChange={e => setContext(e.target.value)}
              dir="auto"
            />
          </div>

          {/* Series selector */}
          {seriesList.length > 0 && (
            <div>
              <label className="label">{ar ? 'السلسلة (اختياري)' : 'Series (optional)'}</label>
              <select
                value={selectedSeries}
                onChange={e => setSelectedSeries(e.target.value)}
                className="input w-full mt-1.5"
              >
                <option value="">— No series —</option>
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.post_count} posts)</option>
                ))}
              </select>
            </div>
          )}

          {/* Variants toggle */}
          <div className="flex items-center justify-between bg-noch-card border border-noch-border rounded-xl px-4 py-3">
            <div>
              <p className="text-white text-sm font-medium">
                {ar ? '3 متغيرات' : '3 Variants mode'}
              </p>
              <p className="text-noch-muted text-xs">
                {ar ? 'ولّد 3 نسخ مختلفة دفعة واحدة' : 'Generate 3 distinct options at once'}
              </p>
            </div>
            <button
              onClick={() => setVariantsMode(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${variantsMode ? 'bg-noch-green' : 'bg-noch-border'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${variantsMode ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            className="btn-primary flex items-center justify-center gap-2 py-3 text-base"
          >
            <Zap size={18} />
            {ar
              ? (variantsMode ? 'ولّد 3 متغيرات' : 'ولّد المحتوى')
              : (variantsMode ? 'Generate 3 Variants' : 'Generate')
            }
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── PHASE: GENERATING ── */}
      {phase === PHASES.GENERATING && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-noch-green">
            <Zap size={16} className="animate-pulse" />
            <span className="text-sm font-medium">
              {ar ? 'جارٍ التوليد...' : 'Generating...'}
            </span>
          </div>
          <div className="card font-mono text-sm text-white/80 whitespace-pre-wrap leading-relaxed min-h-[120px]" dir="auto">
            {rawText || ' '}
            <Cursor />
          </div>
        </div>
      )}

      {/* ── PHASE: RESULT ── */}
      {phase === PHASES.RESULT && (
        <div className="flex flex-col gap-4">
          {/* Intent pill */}
          <div className="flex items-center gap-2">
            <span className="text-lg">{selectedIntent?.emoji}</span>
            <span className="text-noch-muted text-xs">{ar ? selectedIntent?.labelAr : selectedIntent?.label}</span>
            <span className="text-noch-border mx-1">·</span>
            <span className="text-noch-muted text-xs capitalize">{selectedFormat}</span>
            <span className="text-noch-border mx-1">·</span>
            <span className="text-noch-muted text-xs capitalize">{selectedPlatform}</span>
          </div>

          {/* Variants selector */}
          {variants && variants.length > 1 && !editMode && (
            <div className="flex gap-2 mb-1">
              {variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedVariant(i); setResult(v) }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                    selectedVariant === i
                      ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                      : 'border-noch-border text-noch-muted hover:border-noch-green/20 hover:text-white'
                  }`}
                >
                  {ar ? `نسخة ${i + 1}` : `V${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* Edit mode */}
          {editMode ? (
            <div className="flex flex-col gap-3">
              <textarea
                className="input resize-none h-40 text-sm"
                value={editedCaption}
                onChange={e => setEditedCaption(e.target.value)}
                dir="auto"
              />
              <div className="flex gap-2">
                <button onClick={handleUse} disabled={saving} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                  <Check size={16} /> {saving ? '...' : (ar ? 'احفظ' : 'Save')}
                </button>
                <button onClick={() => setEditMode(false)} className="btn-secondary px-4">
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : (
            <ResultBlock
              result={variants ? variants[selectedVariant] : result}
              rawText={rawText}
              onUse={handleUse}
              onRegenerate={handleGenerate}
              onEdit={handleEdit}
              saving={saving}
              lang={lang}
            />
          )}
        </div>
      )}
    </Layout>
  )
}
