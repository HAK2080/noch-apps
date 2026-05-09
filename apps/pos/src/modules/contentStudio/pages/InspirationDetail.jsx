import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Sparkles, Loader2, Trash2, Copy, Brain, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import { getInspiration, updateInspiration, deleteInspiration } from '../services/inspirations'
import { getConceptByInspirationId, createConcept, updateConcept } from '../services/concepts'
import { extractConcept, extractConceptBoth, logExtraction } from '../ai/extractConcept'
import ConceptFields from '../components/ConceptFields'

// Project the AI's flat concept JSON onto the cs_extracted_concepts row
// shape. Only fields the model populated overwrite — null/empty pass
// through so a "mechanism" run never wipes a previous "copy" run, and
// vice versa. (This is what makes the same row additive across modes.)
function projectConcept(fields = {}) {
  const out = {}
  const passthrough = [
    // existing
    'hook_summary', 'content_pattern', 'emotional_driver', 'target_audience',
    'why_it_works', 'reusable_mechanism', 'originality_risk',
    'source_brand', 'voice_type', 'post_nature', 'joke_structure', 'notes',
    // mechanism half (Phase 1 rebuild)
    'mechanism_summary', 'visual_pattern', 'hook_pattern', 'emotional_trigger',
    'why_it_worked', 'suggested_content_mission', 'suggested_nochi_format',
    // adaptation half
    'copy_angle', 'noch_adaptation', 'localization_angle',
    'copy_risk_level', 'risk_reason',
  ]
  for (const k of passthrough) {
    if (fields[k] != null && fields[k] !== '') out[k] = fields[k]
  }
  return out
}

export default function InspirationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [inspiration, setInspiration] = useState(null)
  const [concept, setConcept] = useState(null)
  const [loading, setLoading] = useState(true)
  const [extractingMode, setExtractingMode] = useState(null) // 'copy' | 'mechanism' | 'both' | null
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [insp, conc] = await Promise.all([
        getInspiration(id),
        getConceptByInspirationId(id),
      ])
      setInspiration(insp)
      setConcept(conc)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function handleExtract(mode) {
    if (!inspiration || extractingMode) return
    setExtractingMode(mode)
    try {
      const result = mode === 'both'
        ? await extractConceptBoth({ inspiration })
        : await extractConcept({ inspiration, mode })

      const fields = result?.concept || {}
      const projected = projectConcept(fields)
      // Additive — preserve any fields the prior mode wrote that this
      // mode didn't touch.
      const payload = {
        inspiration_id: inspiration.id,
        ...projected,
        adaptation_mode: mode,
        ai_model: result?.ai_model || result?.mechanism_result?.ai_model || result?.copy_result?.ai_model || null,
        status: concept ? (concept.status || 'draft') : 'draft',
      }
      // originality_risk default only on first creation
      if (!concept && !payload.originality_risk) payload.originality_risk = 'low'

      const row = concept
        ? await updateConcept(concept.id, { ...payload, edited_by_user: false })
        : await createConcept(payload)
      setConcept(row)

      // Audit log — best-effort, never blocks UI.
      if (mode === 'both') {
        if (result.mechanism_result) {
          await logExtraction({
            inspirationId: inspiration.id,
            conceptId: row.id,
            mode: 'mechanism',
            output: result.mechanism_result.concept,
            model: result.mechanism_result.ai_model,
            durationMs: result.mechanism_result.duration_ms,
          })
        }
        if (result.copy_result) {
          await logExtraction({
            inspirationId: inspiration.id,
            conceptId: row.id,
            mode: 'copy',
            output: result.copy_result.concept,
            model: result.copy_result.ai_model,
            durationMs: result.copy_result.duration_ms,
          })
        }
      } else {
        await logExtraction({
          inspirationId: inspiration.id,
          conceptId: row.id,
          mode,
          output: fields,
          model: result?.ai_model,
          durationMs: result?.duration_ms,
        })
      }

      if (inspiration.status !== 'extracted') {
        const updated = await updateInspiration(inspiration.id, { status: 'extracted' })
        setInspiration(updated)
      }

      // Surface partial-failure if Both had one side fail.
      if (mode === 'both' && (result.mechanism_error || result.copy_error)) {
        const which = result.mechanism_error ? 'mechanism' : 'copy'
        toast.error(`${which} extraction failed; the other side saved.`)
      } else {
        const label = mode === 'both' ? 'Adaptation + mechanism extracted'
                    : mode === 'copy' ? 'Adaptation extracted'
                    : 'Mechanism extracted'
        toast.success(label)
      }
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Extraction failed')
    } finally {
      setExtractingMode(null)
    }
  }

  async function handleSaveConcept(values) {
    setSaving(true)
    try {
      if (!concept) {
        const row = await createConcept({ inspiration_id: inspiration.id, ...values, status: 'draft' })
        setConcept(row)
      } else {
        const row = await updateConcept(concept.id, values)
        setConcept(row)
      }
      toast.success('Saved')
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this inspiration? Linked concept and drafts will also be removed.')) return
    try {
      await deleteInspiration(inspiration.id)
      toast.success('Deleted')
      navigate('/content-studio/inspiration')
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  if (loading) return <div className="text-noch-muted text-sm">Loading…</div>
  if (!inspiration) return <div className="text-noch-muted text-sm">Not found</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <Link to="/content-studio/inspiration" className="flex items-center gap-1.5 text-noch-muted hover:text-white text-sm">
          <ArrowLeft size={14} /> Back to inspiration
        </Link>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-noch-muted hover:text-red-400 text-sm"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source pane */}
        <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-3">Source</h2>
          <SourcePreview inspiration={inspiration} />
        </section>

        {/* Concept pane */}
        <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-white font-semibold">Extracted concept</h2>
            {concept?.adaptation_mode && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-noch-green/15 text-noch-green border border-noch-green/30">
                last: {concept.adaptation_mode}
              </span>
            )}
          </div>

          {/* Three-mode launcher */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <ModeButton
              mode="copy"
              label="Copy / Adapt Fast"
              hint="Rewrite for Noch — voice, dialect, product. Flag copy risk."
              icon={Copy}
              activeMode={extractingMode}
              onClick={handleExtract}
            />
            <ModeButton
              mode="mechanism"
              label="Extract Mechanism"
              hint="Why it worked. Reusable strategic intelligence."
              icon={Brain}
              activeMode={extractingMode}
              onClick={handleExtract}
            />
            <ModeButton
              mode="both"
              label="Do Both"
              hint="Run adaptation + mechanism in parallel."
              icon={Layers}
              activeMode={extractingMode}
              onClick={handleExtract}
              accent
            />
          </div>

          {extractingMode && !concept ? (
            <div className="text-noch-muted text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {extractingMode === 'both' ? 'Running adaptation + mechanism…' : `Running ${extractingMode}…`}
            </div>
          ) : (
            <ConceptFields concept={concept} onSave={handleSaveConcept} saving={saving} />
          )}

          {concept?.edited_by_user && (
            <p className="text-noch-muted text-[11px] mt-2">Edited by user</p>
          )}
        </section>
      </div>
    </div>
  )
}

function ModeButton({ mode, label, hint, icon: Icon, activeMode, onClick, accent }) {
  const busy = activeMode === mode
  const disabled = activeMode != null && !busy
  return (
    <button
      onClick={() => onClick(mode)}
      disabled={busy || disabled}
      className={`text-left p-3 rounded-xl border transition-colors disabled:opacity-50 ${
        accent
          ? 'border-noch-green/40 bg-noch-green/5 hover:bg-noch-green/10'
          : 'border-noch-border bg-noch-dark/40 hover:bg-noch-card'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {busy ? (
          <Loader2 size={14} className={accent ? 'animate-spin text-noch-green' : 'animate-spin text-white'} />
        ) : (
          <Icon size={14} className={accent ? 'text-noch-green' : 'text-white'} />
        )}
        <span className={`text-xs font-semibold ${accent ? 'text-noch-green' : 'text-white'}`}>{label}</span>
      </div>
      <p className="text-noch-muted text-[11px] leading-snug">{hint}</p>
    </button>
  )
}

function SourcePreview({ inspiration }) {
  const meta = []
  if (inspiration.platform) meta.push(inspiration.platform)
  if (inspiration.content_pillar) meta.push(inspiration.content_pillar)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-noch-muted text-xs uppercase tracking-wide mb-1">{inspiration.source_type.replace('_', ' ')}</p>
        <h3 className="text-white font-medium">{inspiration.title || 'Untitled'}</h3>
        {meta.length > 0 && <p className="text-noch-muted text-xs mt-1">{meta.join(' · ')}</p>}
      </div>

      {inspiration.preview_image_url && (
        <img src={inspiration.preview_image_url} alt="" className="w-full rounded-lg border border-noch-border" />
      )}

      {inspiration.source_url && (
        <a
          href={inspiration.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-noch-green text-sm break-all"
        >
          <ExternalLink size={12} /> {inspiration.source_url}
        </a>
      )}

      {inspiration.source_text && (
        <pre className="bg-noch-dark border border-noch-border rounded-lg p-3 text-white text-sm whitespace-pre-wrap font-sans max-h-72 overflow-y-auto">
{inspiration.source_text}
        </pre>
      )}

      {inspiration.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {inspiration.tags.map(t => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-noch-border text-noch-muted">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}
