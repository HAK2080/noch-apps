import { useEffect, useState } from 'react'
import { RotateCcw, Sparkles, Loader2, Copy, Brain } from 'lucide-react'
import { calculateConceptQuality, QUALITY_LABELS, QUALITY_COLORS, QUALITY_BG } from '../lib/conceptQuality'

const RISK_BADGE = {
  low:    { label: 'Low risk',    cls: 'bg-noch-green/15 text-noch-green border-noch-green/30' },
  medium: { label: 'Medium risk', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40' },
  high:   { label: 'High risk',   cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
}

// Phase 1 rebuild — Adaptation half (Copy / Adapt Fast output).
const ADAPTATION_FIELDS = [
  { id: 'copy_angle',         label: 'Copy angle',          rows: 2 },
  { id: 'noch_adaptation',    label: 'Nochi adaptation',    rows: 5, mono: true },
  { id: 'localization_angle', label: 'Localization angle',  rows: 2 },
  { id: 'risk_reason',        label: 'Risk reason',         rows: 2 },
]

// Phase 1 rebuild — Mechanism half (Extract Mechanism output).
const MECHANISM_FIELDS = [
  { id: 'mechanism_summary',          label: 'Mechanism summary',          rows: 2 },
  { id: 'hook_pattern',               label: 'Hook pattern',               rows: 2 },
  { id: 'visual_pattern',             label: 'Visual pattern',             rows: 2 },
  { id: 'emotional_trigger',          label: 'Emotional trigger',          rows: 2 },
  { id: 'why_it_worked',              label: 'Why it worked (1 line)',     rows: 2 },
  { id: 'suggested_content_mission',  label: 'Suggested content mission',  rows: 2 },
  { id: 'suggested_nochi_format',     label: 'Suggested Nochi format',     rows: 2 },
]

const FIELDS = [
  { id: 'hook_summary',       label: 'Hook summary',       type: 'textarea', rows: 2 },
  { id: 'content_pattern',    label: 'Content pattern',    type: 'textarea', rows: 2 },
  { id: 'emotional_driver',   label: 'Emotional driver',   type: 'textarea', rows: 2 },
  { id: 'target_audience',    label: 'Target audience',    type: 'textarea', rows: 2 },
  { id: 'why_it_works',       label: 'Why it works',       type: 'textarea', rows: 3 },
  { id: 'reusable_mechanism', label: 'Reusable mechanism', type: 'textarea', rows: 2 },
  { id: 'joke_structure',     label: 'Joke structure',     type: 'textarea', rows: 2, optional: true },
  { id: 'notes',              label: 'Notes',              type: 'textarea', rows: 2 },
]

export default function ConceptFields({ concept, onSave, saving, onScoreChange, onAutoFill }) {
  const [values, setValues] = useState(() => initFrom(concept))
  const [dirty, setDirty] = useState(false)
  const [overrideScore, setOverrideScore] = useState(concept?.quality_score_override ? concept.quality_score : null)
  const [autoFilling, setAutoFilling] = useState(false)

  const missingCategorical = !values.source_brand || !values.voice_type || !values.post_nature || !values.joke_structure

  async function handleAutoFill() {
    if (!onAutoFill) return
    setAutoFilling(true)
    try { await onAutoFill() } finally { setAutoFilling(false) }
  }

  useEffect(() => {
    setValues(initFrom(concept))
    setDirty(false)
    setOverrideScore(concept?.quality_score_override ? concept.quality_score : null)
  }, [concept?.id, concept?.updated_at])

  function update(id, val) {
    setValues(v => ({ ...v, [id]: val }))
    setDirty(true)
  }

  const liveScore = overrideScore ?? calculateConceptQuality({ ...concept, ...values })
  const isOverride = overrideScore !== null
  const scoreLabel = QUALITY_LABELS[liveScore] || ''
  const scoreColor = QUALITY_COLORS[liveScore] || 'text-noch-muted'
  const scoreBg = QUALITY_BG[liveScore] || 'bg-noch-border'

  function handleOverride(score) {
    setOverrideScore(score)
    onScoreChange?.({ quality_score: score, quality_score_override: true })
  }

  function handleResetScore() {
    setOverrideScore(null)
    const auto = calculateConceptQuality({ ...concept, ...values })
    onScoreChange?.({ quality_score: auto, quality_score_override: false })
  }

  async function handleSave() {
    // Pass the current live score as part of the save so it gets persisted.
    const autoScore = overrideScore ?? calculateConceptQuality({ ...concept, ...values })
    await onSave?.({ ...values, quality_score: autoScore, quality_score_override: overrideScore !== null })
    setDirty(false)
  }

  return (
    <div className="space-y-3">
      {/* Quality score bar */}
      <div className="flex items-center gap-2 pb-1 border-b border-noch-border">
        <span className="text-noch-muted text-xs">Quality</span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              title={`Set quality to ${QUALITY_LABELS[n]}`}
              onClick={() => handleOverride(n)}
              className={`w-5 h-5 rounded-full text-[10px] font-bold transition-all border ${
                n <= liveScore
                  ? `${scoreBg} ${scoreColor} border-transparent`
                  : 'bg-noch-dark border-noch-border text-noch-muted/30'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className={`text-xs font-medium ${scoreColor}`}>{scoreLabel}</span>
        {isOverride && (
          <button
            onClick={handleResetScore}
            title="Reset to auto-calculated score"
            className="ml-1 text-noch-muted hover:text-white transition-colors"
          >
            <RotateCcw size={11} />
          </button>
        )}
        {isOverride && (
          <span className="text-[10px] text-noch-muted/60 ml-1">manual</span>
        )}
        {onAutoFill && missingCategorical && (
          <button
            onClick={handleAutoFill}
            disabled={autoFilling || saving}
            className="ml-auto flex items-center gap-1 text-[11px] text-noch-green hover:bg-noch-green/10 px-2 py-1 rounded-md disabled:opacity-50"
            title="Re-extract from inspiration to fill empty fields"
          >
            {autoFilling ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            Auto-fill missing
          </button>
        )}
      </div>

      {FIELDS.map(f => (
        <Field key={f.id} label={f.label}>
          <textarea
            rows={f.rows}
            value={values[f.id] || ''}
            onChange={e => update(f.id, e.target.value)}
            className={inputCls}
          />
        </Field>
      ))}

      {/* Adaptation half — only render if ANY adaptation field is filled */}
      {ADAPTATION_FIELDS.some(f => values[f.id]) || values.copy_risk_level ? (
        <CollapsibleSection
          title="Adaptation (Copy / Adapt Fast)"
          icon={Copy}
          accentClass="border-noch-green/30 bg-noch-green/5"
          defaultOpen
        >
          {/* Copy risk level — three-state pill selector */}
          <Field label="Copy risk level">
            <div className="flex items-center gap-2 flex-wrap">
              {['low', 'medium', 'high'].map(level => {
                const active = values.copy_risk_level === level
                const meta = RISK_BADGE[level]
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => update('copy_risk_level', active ? null : level)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
                      active ? meta.cls : 'border-noch-border text-noch-muted hover:text-white'
                    }`}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </Field>

          {ADAPTATION_FIELDS.map(f => (
            <Field key={f.id} label={f.label}>
              <textarea
                rows={f.rows}
                value={values[f.id] || ''}
                onChange={e => update(f.id, e.target.value)}
                className={f.mono ? `${inputCls} font-mono text-[13px] leading-relaxed` : inputCls}
              />
            </Field>
          ))}
        </CollapsibleSection>
      ) : null}

      {/* Mechanism half — only render if any mechanism field is filled */}
      {MECHANISM_FIELDS.some(f => values[f.id]) ? (
        <CollapsibleSection
          title="Mechanism (Extract Mechanism)"
          icon={Brain}
          accentClass="border-purple-500/30 bg-purple-500/5"
          defaultOpen
        >
          {MECHANISM_FIELDS.map(f => (
            <Field key={f.id} label={f.label}>
              <textarea
                rows={f.rows}
                value={values[f.id] || ''}
                onChange={e => update(f.id, e.target.value)}
                className={inputCls}
              />
            </Field>
          ))}
        </CollapsibleSection>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Source brand">
          <input
            value={values.source_brand || ''}
            onChange={e => update('source_brand', e.target.value || null)}
            placeholder="e.g. duolingo, unknown"
            className={inputCls}
          />
        </Field>
        <Field label="Voice type (1-3 words)">
          <input
            value={values.voice_type || ''}
            onChange={e => update('voice_type', e.target.value || null)}
            placeholder="e.g. snarky, warm expert"
            className={inputCls}
          />
        </Field>
        <Field label="Post nature">
          <input
            value={values.post_nature || ''}
            onChange={e => update('post_nature', e.target.value || null)}
            placeholder="meme / text / reaction / tutorial"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Originality risk (informational flag)">
        <input
          value={values.originality_risk || ''}
          onChange={e => update('originality_risk', e.target.value || null)}
          placeholder="e.g. low, medium, high, trending format, overused…"
          className={inputCls}
        />
      </Field>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
    </div>
  )
}

function initFrom(c) {
  return {
    hook_summary: c?.hook_summary || '',
    content_pattern: c?.content_pattern || '',
    emotional_driver: c?.emotional_driver || '',
    target_audience: c?.target_audience || '',
    why_it_works: c?.why_it_works || '',
    reusable_mechanism: c?.reusable_mechanism || '',
    joke_structure: c?.joke_structure || '',
    notes: c?.notes || '',
    originality_risk: c?.originality_risk || '',
    source_brand: c?.source_brand || '',
    voice_type: c?.voice_type || '',
    post_nature: c?.post_nature || '',
    // Phase 1 rebuild — adaptation half
    copy_angle: c?.copy_angle || '',
    noch_adaptation: c?.noch_adaptation || '',
    localization_angle: c?.localization_angle || '',
    copy_risk_level: c?.copy_risk_level || '',
    risk_reason: c?.risk_reason || '',
    // Phase 1 rebuild — mechanism half
    mechanism_summary: c?.mechanism_summary || '',
    hook_pattern: c?.hook_pattern || '',
    visual_pattern: c?.visual_pattern || '',
    emotional_trigger: c?.emotional_trigger || '',
    why_it_worked: c?.why_it_worked || '',
    suggested_content_mission: c?.suggested_content_mission || '',
    suggested_nochi_format: c?.suggested_nochi_format || '',
  }
}

const inputCls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/60 focus:outline-none focus:border-noch-green'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-noch-muted text-xs mb-1">{label}</span>
      {children}
    </label>
  )
}

function CollapsibleSection({ title, icon: Icon, accentClass, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className={`border rounded-xl ${accentClass}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2"
      >
        <Icon size={14} className="text-white shrink-0" />
        <span className="text-white text-xs font-semibold flex-1 text-left">{title}</span>
        <span className="text-noch-muted text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-current/10">
          {children}
        </div>
      )}
    </div>
  )
}
