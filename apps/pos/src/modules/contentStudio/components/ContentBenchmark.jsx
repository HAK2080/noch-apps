import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  Loader2,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { evaluateDraft } from '../ai/evaluateDraft'
import { BENCHMARK_DIMENSIONS, addUniqueSample, getBenchmarkSummary } from '../lib/contentBenchmark'
import { listInspirations } from '../services/inspirations'
import { recordSignal } from '../services/learningSignals'
import { updateVoiceProfile } from '../services/voiceProfiles'

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X / Twitter' },
  { value: 'other', label: 'Other' },
]

const TONE = {
  strong: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  review: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  weak: 'border-red-500/30 bg-red-500/10 text-red-300',
}

export default function ContentBenchmark({
  businessId,
  voiceProfile,
  onProfileChanged,
  onSignalRecorded,
}) {
  const [content, setContent] = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [inspirations, setInspirations] = useState([])
  const [selectedInspiration, setSelectedInspiration] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [savingExample, setSavingExample] = useState('')
  const [result, setResult] = useState(null)
  const summary = useMemo(() => getBenchmarkSummary(result?.scores), [result])

  useEffect(() => {
    let cancelled = false
    if (!businessId) {
      setInspirations([])
      return undefined
    }
    listInspirations({ businessId })
      .then(rows => {
        if (!cancelled) setInspirations(rows.filter(row => row.source_text?.trim()))
      })
      .catch(() => {
        if (!cancelled) setInspirations([])
      })
    return () => { cancelled = true }
  }, [businessId])

  useEffect(() => {
    setResult(null)
  }, [voiceProfile?.id])

  function loadInspiration(id) {
    setSelectedInspiration(id)
    const inspiration = inspirations.find(item => item.id === id)
    if (!inspiration) return
    setContent(inspiration.source_text || '')
    if (inspiration.platform) setPlatform(inspiration.platform)
    setResult(null)
  }

  async function evaluate() {
    if (!content.trim()) return toast.error('Paste a post or select an inspiration first')
    setEvaluating(true)
    setResult(null)
    try {
      const evaluation = await evaluateDraft({
        draft: {
          body_text: content.trim(),
          platform,
          format: 'social_post',
        },
        voiceProfile,
      })
      setResult(evaluation)
    } catch (error) {
      toast.error(error.message || 'Content benchmark failed')
    } finally {
      setEvaluating(false)
    }
  }

  async function saveExample(kind) {
    if (!result || !content.trim()) return
    const field = kind === 'good' ? 'good_caption_samples' : 'bad_caption_samples'
    const signalType = kind === 'good' ? 'approved' : 'rejected'
    setSavingExample(kind)
    try {
      const updated = await updateVoiceProfile(voiceProfile.id, {
        [field]: addUniqueSample(voiceProfile[field], content),
      })
      await recordSignal({
        business_id: businessId,
        brand_voice_profile_id: voiceProfile.id,
        signal_type: signalType,
        source_table: 'cs_brand_voice_profiles',
        source_id: voiceProfile.id,
        payload: {
          source: 'content_benchmark',
          platform,
          content: content.trim(),
          scores: result.scores || {},
          labels: result.labels || [],
        },
      })
      onProfileChanged?.(updated)
      onSignalRecorded?.()
      toast.success(kind === 'good' ? 'Saved as a strong brand example' : 'Saved as an example to avoid')
    } catch (error) {
      toast.error(error.message || 'Could not save training example')
    } finally {
      setSavingExample('')
    }
  }

  function reset() {
    setContent('')
    setSelectedInspiration('')
    setResult(null)
  }

  return (
    <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={17} className="text-yellow-300" />
            <h3 className="text-white font-semibold">Content Benchmark</h3>
          </div>
          <p className="text-noch-muted text-xs mt-1">
            Score a real Noch post, draft, or competitor caption against <span className="text-white">{voiceProfile.name}</span>—your live brand manifesto.
          </p>
        </div>
        {(content || result) && (
          <button onClick={reset} className="text-noch-muted hover:text-white" title="Clear benchmark">
            <RotateCcw size={15} />
          </button>
        )}
      </header>

      {inspirations.length > 0 && (
        <label className="block mb-3">
          <span className="text-noch-muted text-xs block mb-1">Load a saved text post</span>
          <select
            value={selectedInspiration}
            onChange={event => loadInspiration(event.target.value)}
            className="input w-full text-sm"
          >
            <option value="">Choose from Inspiration…</option>
            {inspirations.map(item => (
              <option key={item.id} value={item.id}>
                {[item.platform, item.title || item.source_text.slice(0, 55)].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
        <label>
          <span className="text-noch-muted text-xs block mb-1">Platform</span>
          <select value={platform} onChange={event => setPlatform(event.target.value)} className="input w-full text-sm">
            {PLATFORMS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span className="text-noch-muted text-xs block mb-1">Post or caption</span>
          <textarea
            value={content}
            onChange={event => {
              setContent(event.target.value)
              setResult(null)
            }}
            rows={6}
            maxLength={5000}
            className="input w-full resize-y text-sm"
            placeholder="Paste the actual caption here…"
          />
          <span className="block text-right text-[11px] text-noch-muted mt-1">{content.length}/5000</span>
        </label>
      </div>

      <button
        onClick={evaluate}
        disabled={evaluating || !content.trim()}
        className="btn-primary mt-3 flex items-center gap-2 text-sm disabled:opacity-50"
      >
        {evaluating ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
        {evaluating ? 'Benchmarking…' : 'Analyze against manifesto'}
      </button>

      {result && (
        <div className="mt-5 space-y-4 border-t border-noch-border pt-4">
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${TONE[summary.tone]}`}>
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Overall match</p>
              <p className="font-semibold">{summary.verdict}</p>
            </div>
            <span className="text-2xl font-bold">{summary.percentage}%</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {BENCHMARK_DIMENSIONS.map(({ key, label }) => {
              const score = Number(result.scores?.[key] || 0)
              const percentage = Math.round((score / 5) * 100)
              return (
                <div key={key} className="rounded-lg border border-noch-border bg-noch-dark/40 px-3 py-2">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-noch-muted">{label}</span>
                    <span className="text-white font-semibold">{score || '—'}/5</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-noch-border overflow-hidden">
                    <div className="h-full rounded-full bg-noch-green" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {result.labels?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.labels.map(label => (
                <span key={label} className="rounded-full border border-noch-border bg-noch-dark px-2.5 py-1 text-xs text-noch-muted">
                  {label.replaceAll('_', ' ')}
                </span>
              ))}
            </div>
          )}

          {Object.keys(result.explanations || {}).length > 0 && (
            <div className="space-y-1 rounded-xl border border-noch-border bg-noch-dark/30 p-3">
              {Object.entries(result.explanations).map(([label, explanation]) => (
                <p key={label} className="text-xs text-noch-muted">
                  <span className="text-white font-medium">{label.replaceAll('_', ' ')}:</span> {explanation}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => saveExample('good')}
              disabled={Boolean(savingExample)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {savingExample === 'good' ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
              Save as our voice
            </button>
            <button
              onClick={() => saveExample('bad')}
              disabled={Boolean(savingExample)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {savingExample === 'bad' ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
              Save as avoid
            </button>
            {savingExample === '' && (
              <span className="inline-flex items-center gap-1.5 text-xs text-noch-muted">
                <Check size={12} className="text-noch-green" /> Your decision trains this voice profile.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
