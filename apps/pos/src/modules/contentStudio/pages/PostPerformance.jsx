import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Save,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../components/EmptyState'
import { evaluateDraft } from '../ai/evaluateDraft'
import { addUniqueSample, BENCHMARK_DIMENSIONS } from '../lib/contentBenchmark'
import {
  derivePerformanceSignalTypes,
  evaluatePostEffectiveness,
  summarizePostPerformance,
} from '../lib/postPerformance'
import { listBankItems, updateBankItemPerformance } from '../services/contentBank'
import { recordSignal } from '../services/learningSignals'
import { listVoiceProfiles, updateVoiceProfile } from '../services/voiceProfiles'

const FORM_FIELDS = [
  'posted_at',
  'perf_platform',
  'perf_format',
  'perf_post_url',
  'perf_reach',
  'perf_impressions',
  'perf_views',
  'perf_likes',
  'perf_comments',
  'perf_shares',
  'perf_saves',
  'perf_profile_visits',
  'perf_link_clicks',
  'perf_orders_before',
  'perf_orders_after',
  'perf_loyalty_visits_after',
  'hook_rating',
  'creative_rating',
  'business_impact_rating',
  'perf_worked_because',
  'perf_did_not_work_because',
  'perf_notes',
]

function formFromItem(item = {}) {
  const form = {}
  for (const field of FORM_FIELDS) {
    if (field === 'posted_at') form[field] = item[field]?.slice(0, 16) || ''
    else form[field] = item[field] ?? ''
  }
  form.perf_platform ||= item.platform || 'instagram'
  form.perf_format ||= item.format || ''
  return form
}

function formatNumber(value, suffix = '') {
  if (value === '' || value == null) return '—'
  if (!Number.isFinite(Number(value))) return '—'
  return `${new Intl.NumberFormat('en').format(Number(value))}${suffix}`
}

function scoreTone(score) {
  if (!Number.isFinite(score)) return 'border-noch-border text-noch-muted'
  if (score >= 80) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  if (score >= 65) return 'border-noch-green/40 bg-noch-green/10 text-noch-green'
  if (score >= 50) return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  return 'border-red-500/40 bg-red-500/10 text-red-300'
}

export default function PostPerformance() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [items, setItems] = useState([])
  const [voices, setVoices] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [form, setForm] = useState({})
  const [manifestoEvaluation, setManifestoEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const refresh = useCallback(async () => {
    if (!businessId) {
      setItems([])
      setVoices([])
      setSelectedId('')
      return
    }
    setLoading(true)
    try {
      const [bankItems, voiceProfiles] = await Promise.all([
        listBankItems({ businessId, status: 'approved' }),
        listVoiceProfiles(businessId),
      ])
      setItems(bankItems)
      setVoices(voiceProfiles)
      setSelectedId(current => bankItems.some(item => item.id === current)
        ? current
        : bankItems[0]?.id || '')
    } catch (error) {
      toast.error(error.message || 'Could not load post performance')
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => { refresh() }, [refresh])

  const selected = items.find(item => item.id === selectedId) || null

  useEffect(() => {
    if (!selected) {
      setForm({})
      setVoiceId('')
      setManifestoEvaluation(null)
      return
    }
    setForm(formFromItem(selected))
    setVoiceId(selected.brand_voice_profile_id || voices[0]?.id || '')
    setManifestoEvaluation(selected.perf_ai_evaluation?.manifesto || null)
  }, [selected, voices])

  const draftItem = useMemo(() => ({ ...selected, ...form }), [selected, form])
  const report = useMemo(() => evaluatePostEffectiveness({
    item: draftItem,
    peers: items,
    manifestoEvaluation,
  }), [draftItem, items, manifestoEvaluation])
  const summary = useMemo(() => summarizePostPerformance(items), [items])

  function set(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  async function persistMetrics({ notify = true } = {}) {
    if (!selected) return null
    setSaving(true)
    try {
      const saved = await updateBankItemPerformance(selected.id, {
        ...form,
        posted_at: form.posted_at ? new Date(form.posted_at).toISOString() : null,
      })
      setItems(current => current.map(item => item.id === saved.id ? { ...item, ...saved } : item))
      if (notify) toast.success('Performance metrics saved')
      return saved
    } catch (error) {
      toast.error(error.message || 'Could not save performance')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function runEvaluator() {
    if (!selected) return
    const voiceProfile = voices.find(voice => voice.id === voiceId)
    setEvaluating(true)
    try {
      const savedMetrics = await persistMetrics({ notify: false })
      if (!savedMetrics) return

      let manifesto = null
      if (voiceProfile && selected.final_text?.trim()) {
        manifesto = await evaluateDraft({
          draft: {
            body_text: selected.final_text,
            platform: form.perf_platform || selected.platform || 'instagram',
            format: form.perf_format || selected.format || 'social_post',
            hashtags: selected.hashtags || [],
          },
          voiceProfile,
        })
      }

      const evaluated = evaluatePostEffectiveness({
        item: savedMetrics,
        peers: items,
        manifestoEvaluation: manifesto,
      })
      const signalTypes = derivePerformanceSignalTypes(evaluated)
      const evaluatedAt = new Date().toISOString()
      const persisted = await updateBankItemPerformance(selected.id, {
        perf_engagement_rate: evaluated.engagementRate,
        perf_effectiveness_score: evaluated.effectivenessScore,
        perf_manifesto_score: evaluated.manifestoScore,
        perf_ai_evaluation: {
          manifesto,
          report: evaluated,
          signals: signalTypes,
        },
        perf_evaluated_at: evaluatedAt,
      })

      setManifestoEvaluation(manifesto)
      setItems(current => current.map(item => item.id === persisted.id ? { ...item, ...persisted } : item))

      try {
        await recordSignal({
          business_id: businessId,
          brand_voice_profile_id: voiceProfile?.id || null,
          signal_type: 'performance_evaluated',
          source_table: 'cs_content_bank_items',
          source_id: selected.id,
          payload: {
            effectiveness_score: evaluated.effectivenessScore,
            performance_score: evaluated.performanceScore,
            manifesto_score: evaluated.manifestoScore,
            engagement_rate: evaluated.engagementRate,
            order_lift: evaluated.orderLift,
            classification: signalTypes,
          },
        })
      } catch (error) {
        console.warn('Performance learning signal failed:', error)
      }

      if (voiceProfile && Number.isFinite(evaluated.effectivenessScore)) {
        const field = evaluated.effectivenessScore >= 80 && evaluated.manifestoScore >= 70
          ? 'good_caption_samples'
          : evaluated.effectivenessScore < 45 || evaluated.manifestoScore < 50
            ? 'bad_caption_samples'
            : null
        if (field) {
          try {
            const updatedVoice = await updateVoiceProfile(voiceProfile.id, {
              [field]: addUniqueSample(voiceProfile[field], selected.final_text),
            })
            setVoices(current => current.map(voice => voice.id === updatedVoice.id ? updatedVoice : voice))
          } catch (error) {
            console.warn('Voice learning update failed:', error)
          }
        }
      }

      toast.success(`Effectiveness: ${evaluated.effectivenessScore ?? '—'}/100 · ${evaluated.verdict}`)
    } catch (error) {
      toast.error(error.message || 'Effectiveness evaluation failed')
    } finally {
      setEvaluating(false)
    }
  }

  if (ctxLoading) return null
  if (!businesses?.length) {
    return <EmptyState icon={BarChart3} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  }
  if (!businessId) return <EmptyState icon={BarChart3} title="Pick a business" />
  if (loading) return <div className="flex justify-center py-12 text-noch-muted"><Loader2 className="animate-spin" /></div>
  if (!items.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No approved content to evaluate"
        description="Approve a draft into the Content Bank first, then record its real social performance here."
        ctaLabel="Open Content Bank"
        ctaTo="/content-studio/bank"
      />
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={19} className="text-noch-green" />
            <h2 className="text-white text-xl font-semibold">Post Performance</h2>
          </div>
          <p className="text-noch-muted text-sm mt-1">
            Combine real social results, business impact, and Noch manifesto fit into one effectiveness score.
          </p>
        </div>
        <span className="text-xs text-noch-muted border border-noch-border rounded-full px-3 py-1">
          65% real performance · 35% brand fit
        </span>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Tracked posts" value={`${summary.tracked}/${summary.total}`} />
        <SummaryCard label="Evaluated" value={summary.evaluated} />
        <SummaryCard label="Average effectiveness" value={formatNumber(summary.averageEffectiveness, '/100')} />
        <SummaryCard label="Average engagement" value={formatNumber(summary.averageEngagementRate, '%')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4">
        <aside className="bg-noch-card border border-noch-border rounded-2xl p-3 h-fit xl:sticky xl:top-4">
          <p className="text-noch-muted text-xs uppercase tracking-wide px-2 pb-2">Noch posts</p>
          <div className="space-y-1 max-h-[70vh] overflow-y-auto">
            {items.map(item => {
              const active = item.id === selectedId
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    active
                      ? 'border-noch-green/50 bg-noch-green/10'
                      : 'border-transparent hover:border-noch-border hover:bg-noch-dark/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-noch-muted">
                      {item.perf_platform || item.platform || 'post'}
                    </span>
                    <span className={`text-xs font-bold ${Number(item.perf_effectiveness_score) >= 65 ? 'text-noch-green' : 'text-noch-muted'}`}>
                      {item.perf_effectiveness_score != null && Number.isFinite(Number(item.perf_effectiveness_score))
                        ? `${item.perf_effectiveness_score}/100`
                        : 'not scored'}
                    </span>
                  </div>
                  <p className="text-white text-xs mt-1 line-clamp-3">{item.final_text}</p>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="space-y-4 min-w-0">
          <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <p className="text-white text-sm whitespace-pre-wrap">{selected.final_text}</p>
                <p className="text-noch-muted text-xs mt-2">
                  {selected.voice?.name || 'No voice profile'} · {selected.format?.replaceAll('_', ' ')}
                </p>
              </div>
              {form.perf_post_url && (
                <a href={form.perf_post_url} target="_blank" rel="noreferrer" className="text-noch-green shrink-0" title="Open published post">
                  <ExternalLink size={16} />
                </a>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Published post URL" wide>
                <input className="input w-full text-xs" value={form.perf_post_url || ''} onChange={event => set('perf_post_url', event.target.value)} placeholder="https://instagram.com/…" />
              </Field>
              <Field label="Posted at">
                <input type="datetime-local" className="input w-full text-xs" value={form.posted_at || ''} onChange={event => set('posted_at', event.target.value)} />
              </Field>
              <Field label="Platform">
                <select className="input w-full text-xs" value={form.perf_platform || ''} onChange={event => set('perf_platform', event.target.value)}>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                  <option value="x">X / Twitter</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Format">
                <input className="input w-full text-xs" value={form.perf_format || ''} onChange={event => set('perf_format', event.target.value)} />
              </Field>
            </div>
          </section>

          <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
            <SectionTitle icon={Activity} title="Real performance" subtitle="Enter the numbers shown by the social platform." />
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {[
                ['perf_reach', 'Reach'],
                ['perf_impressions', 'Impressions'],
                ['perf_views', 'Views'],
                ['perf_likes', 'Likes'],
                ['perf_comments', 'Comments'],
                ['perf_shares', 'Shares'],
                ['perf_saves', 'Saves'],
                ['perf_profile_visits', 'Profile visits'],
                ['perf_link_clicks', 'Link clicks'],
                ['perf_loyalty_visits_after', 'Loyalty visits after'],
              ].map(([field, label]) => (
                <MetricInput key={field} label={label} value={form[field]} onChange={value => set(field, value)} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 max-w-md">
              <MetricInput label="Product orders before" value={form.perf_orders_before} onChange={value => set('perf_orders_before', value)} />
              <MetricInput label="Product orders after" value={form.perf_orders_after} onChange={value => set('perf_orders_after', value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <Rating label="Hook" value={form.hook_rating} onChange={value => set('hook_rating', value)} />
              <Rating label="Creative" value={form.creative_rating} onChange={value => set('creative_rating', value)} />
              <Rating label="Business impact" value={form.business_impact_rating} onChange={value => set('business_impact_rating', value)} />
            </div>

            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <Field label="Worked because…">
                <textarea rows={3} className="input w-full text-xs resize-y" value={form.perf_worked_because || ''} onChange={event => set('perf_worked_because', event.target.value)} />
              </Field>
              <Field label="Did not work because…">
                <textarea rows={3} className="input w-full text-xs resize-y" value={form.perf_did_not_work_because || ''} onChange={event => set('perf_did_not_work_because', event.target.value)} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Review notes">
                <textarea rows={2} className="input w-full text-xs resize-y" value={form.perf_notes || ''} onChange={event => set('perf_notes', event.target.value)} />
              </Field>
            </div>

            <div className="flex flex-wrap items-end gap-3 mt-4">
              <Field label="Manifesto profile">
                <select className="input min-w-64 text-xs" value={voiceId} onChange={event => setVoiceId(event.target.value)}>
                  <option value="">No profile · performance only</option>
                  {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                </select>
              </Field>
              <button onClick={() => persistMetrics()} disabled={saving || evaluating} className="btn-secondary inline-flex items-center gap-2 text-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save metrics
              </button>
              <button onClick={runEvaluator} disabled={saving || evaluating} className="btn-primary inline-flex items-center gap-2 text-sm">
                {evaluating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {evaluating ? 'Evaluating…' : 'Evaluate effectiveness'}
              </button>
            </div>
          </section>

          <EffectivenessReport report={report} manifestoEvaluation={manifestoEvaluation} />
        </main>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-noch-card border border-noch-border rounded-xl px-4 py-3">
      <p className="text-noch-muted text-xs">{label}</p>
      <p className="text-white text-xl font-bold mt-1">{value ?? '—'}</p>
    </div>
  )
}

function SectionTitle({ icon, title, subtitle }) {
  const IconComponent = icon
  return (
    <header className="flex items-start gap-2 mb-4">
      <IconComponent size={16} className="text-noch-green mt-0.5" />
      <div>
        <h3 className="text-white font-semibold">{title}</h3>
        {subtitle && <p className="text-noch-muted text-xs">{subtitle}</p>}
      </div>
    </header>
  )
}

function Field({ label, children, wide = false }) {
  return (
    <label className={wide ? 'md:col-span-2' : ''}>
      <span className="text-noch-muted text-[11px] block mb-1">{label}</span>
      {children}
    </label>
  )
}

function MetricInput({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        className="input w-full text-sm"
        value={value ?? ''}
        onChange={event => onChange(event.target.value)}
        placeholder="0"
      />
    </Field>
  )
}

function Rating({ label, value, onChange }) {
  return (
    <div>
      <span className="text-noch-muted text-[11px] block mb-1">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(score => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`h-8 flex-1 rounded-lg border text-xs font-semibold ${
              Number(value) === score
                ? 'border-noch-green bg-noch-green/15 text-noch-green'
                : 'border-noch-border text-noch-muted hover:text-white'
            }`}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  )
}

function EffectivenessReport({ report, manifestoEvaluation }) {
  const score = report.effectivenessScore
  return (
    <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
      <SectionTitle icon={Brain} title="Effectiveness report" subtitle="Transparent scoring from real outcomes and manifesto fit." />

      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-5">
        <div className={`rounded-2xl border p-5 text-center ${scoreTone(score)}`}>
          <p className="text-xs uppercase tracking-wide opacity-80">Overall effectiveness</p>
          <p className="text-5xl font-bold mt-2">{Number.isFinite(score) ? score : '—'}</p>
          <p className="font-semibold mt-1">{report.verdict}</p>
          <p className="text-[11px] opacity-70 mt-2">{report.confidence.replaceAll('_', ' ')}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <ScoreCard label="Real performance" score={report.performanceScore} icon={TrendingUp} />
          <ScoreCard label="Manifesto match" score={report.manifestoScore} icon={Brain} />
          <ScoreCard
            label="Engagement rate"
            score={report.engagementRate}
            suffix="%"
            note={`Noch benchmark ${report.engagementBenchmark}%`}
            icon={Activity}
          />
          <ScoreCard
            label="Orders lift"
            score={report.orderLift}
            suffix="%"
            note={report.orderLift == null ? 'Add orders before and after' : 'After publishing'}
            icon={BarChart3}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <InsightList title="What worked" items={report.strengths} positive />
        <InsightList title="Needs attention" items={report.risks} />
      </div>

      <div className="mt-5">
        <p className="text-noch-muted text-xs uppercase tracking-wide mb-2">Score breakdown</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {report.components.map(component => (
            <div key={component.key} className="border border-noch-border rounded-xl px-3 py-2">
              <p className="text-noch-muted text-[11px]">{component.label}</p>
              <p className="text-white font-semibold">{formatNumber(component.score, '/100')}</p>
            </div>
          ))}
        </div>
      </div>

      {manifestoEvaluation && (
        <div className="mt-5 border-t border-noch-border pt-4">
          <p className="text-noch-muted text-xs uppercase tracking-wide mb-2">Manifesto dimensions</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {BENCHMARK_DIMENSIONS.map(dimension => (
              <div key={dimension.key} className="flex items-center justify-between rounded-lg bg-noch-dark/40 border border-noch-border px-3 py-2 text-xs">
                <span className="text-noch-muted">{dimension.label}</span>
                <span className="text-white font-semibold">{manifestoEvaluation.scores?.[dimension.key] || '—'}/5</span>
              </div>
            ))}
          </div>
          {manifestoEvaluation.labels?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {manifestoEvaluation.labels.map(label => (
                <span key={label} className="rounded-full border border-noch-border bg-noch-dark px-2.5 py-1 text-xs text-noch-muted">
                  {label.replaceAll('_', ' ')}
                </span>
              ))}
            </div>
          )}
          {Object.keys(manifestoEvaluation.explanations || {}).length > 0 && (
            <div className="space-y-1 rounded-xl border border-noch-border bg-noch-dark/30 p-3 mt-3">
              {Object.entries(manifestoEvaluation.explanations).map(([label, explanation]) => (
                <p key={label} className="text-xs text-noch-muted">
                  <span className="text-white font-medium">{label.replaceAll('_', ' ')}:</span> {explanation}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ScoreCard({ label, score, suffix = '/100', note, icon }) {
  const IconComponent = icon
  return (
    <div className="border border-noch-border rounded-xl p-3">
      <div className="flex items-center gap-2 text-noch-muted text-xs">
        <IconComponent size={13} className="text-noch-green" />
        {label}
      </div>
      <p className="text-white text-2xl font-bold mt-1">{formatNumber(score, suffix)}</p>
      {note && <p className="text-noch-muted text-[11px] mt-0.5">{note}</p>}
    </div>
  )
}

function InsightList({ title, items, positive = false }) {
  const Icon = positive ? CheckCircle2 : AlertTriangle
  return (
    <div className="border border-noch-border rounded-xl p-3">
      <p className="text-white text-sm font-medium mb-2">{title}</p>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={item} className="flex items-start gap-2 text-xs text-noch-muted">
              <Icon size={13} className={positive ? 'text-noch-green mt-0.5' : 'text-amber-400 mt-0.5'} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-noch-muted text-xs">Add more evidence to generate findings.</p>
      )}
    </div>
  )
}
