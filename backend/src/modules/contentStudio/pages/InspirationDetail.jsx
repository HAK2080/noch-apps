import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Sparkles, Loader2, Trash2, FileEdit } from 'lucide-react'
import toast from 'react-hot-toast'
import { getInspiration, updateInspiration, deleteInspiration } from '../services/inspirations'
import { getConceptByInspirationId, createConcept, updateConcept } from '../services/concepts'
import { extractConcept } from '../ai/extractConcept'
import { createBrief } from '../services/creativeBriefs'
import ConceptFields from '../components/ConceptFields'
import { ADAPTATION_MODES, COPY_RISK_LEVELS } from '../lib/constants'

export default function InspirationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [inspiration, setInspiration] = useState(null)
  const [concept, setConcept] = useState(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adaptMode, setAdaptMode] = useState(null)
  const [adaptFields, setAdaptFields] = useState({})
  const [savingAdapt, setSavingAdapt] = useState(false)
  const [creatingBrief, setCreatingBrief] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [insp, conc] = await Promise.all([
        getInspiration(id),
        getConceptByInspirationId(id),
      ])
      setInspiration(insp)
      setConcept(conc)
      if (insp?.adaptation_mode) {
        setAdaptMode(insp.adaptation_mode)
        setAdaptFields({
          copy_angle:        insp.copy_angle        || '',
          copy_risk_level:   insp.copy_risk_level   || 'low',
          noch_adaptation:   insp.noch_adaptation   || '',
          localization_angle: insp.localization_angle || '',
          risk_reason:       insp.risk_reason       || '',
        })
      }
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function handleExtract() {
    if (!inspiration) return
    setExtracting(true)
    try {
      const result = await extractConcept({ inspiration })
      const fields = result?.concept || result || {}
      const payload = {
        inspiration_id: inspiration.id,
        hook_summary: fields.hook_summary || null,
        content_pattern: fields.content_pattern || null,
        emotional_driver: fields.emotional_driver || null,
        target_audience: fields.target_audience || null,
        why_it_works: fields.why_it_works || null,
        reusable_mechanism: fields.reusable_mechanism || null,
        originality_risk: fields.originality_risk || 'low',
        source_brand: fields.source_brand || null,
        voice_type: fields.voice_type || null,
        post_nature: fields.post_nature || null,
        notes: fields.notes || null,
        ai_model: result?.ai_model || null,
        status: concept ? (concept.status || 'draft') : 'draft',
      }
      const row = concept
        ? await updateConcept(concept.id, { ...payload, edited_by_user: false })
        : await createConcept(payload)
      setConcept(row)
      if (inspiration.status !== 'extracted') {
        const updated = await updateInspiration(inspiration.id, { status: 'extracted' })
        setInspiration(updated)
      }
      toast.success('Concept extracted')
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Extraction failed')
    } finally {
      setExtracting(false)
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

  async function handleSaveAdaptation() {
    if (!adaptMode) return
    setSavingAdapt(true)
    try {
      const updated = await updateInspiration(inspiration.id, {
        adaptation_mode: adaptMode,
        ...adaptFields,
      })
      setInspiration(updated)
      toast.success('Adaptation mode saved')
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSavingAdapt(false)
    }
  }

  async function handleCreateBriefFromInspiration() {
    if (!inspiration) return
    setCreatingBrief(true)
    try {
      const brief = await createBrief({
        business_id: inspiration.business_id,
        reference_inspiration_id: inspiration.id,
        reference_concept_id: concept?.id || null,
        status: 'draft',
        notes: inspiration.title || null,
      })
      navigate(`/content-studio/briefs/${brief.id}`)
    } catch (e) {
      toast.error(e.message || 'Failed to create brief')
      setCreatingBrief(false)
    }
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
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-white font-semibold">Extracted concept</h2>
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-xs disabled:opacity-50"
            >
              {extracting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {concept ? 'Re-extract' : 'Extract concept'}
            </button>
          </div>
          {concept || !extracting ? (
            <ConceptFields concept={concept} onSave={handleSaveConcept} saving={saving} />
          ) : (
            <div className="text-noch-muted text-sm">Working…</div>
          )}
          {concept?.edited_by_user && (
            <p className="text-noch-muted text-[11px] mt-2">Edited by user</p>
          )}
        </section>
      </div>

      {/* Adaptation mode */}
      <section className="bg-noch-card border border-noch-border rounded-2xl p-5 mt-4">
        <h2 className="text-white font-semibold mb-3">Adaptation strategy</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {ADAPTATION_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setAdaptMode(m.id)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                adaptMode === m.id
                  ? 'border-noch-green bg-noch-green/10'
                  : 'border-noch-border bg-noch-dark hover:border-white/30'
              }`}
            >
              <p className="text-white text-sm font-medium">{m.label}</p>
              <p className="text-noch-muted text-xs mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>

        {adaptMode && (adaptMode === 'copy_adapt' || adaptMode === 'both') && (
          <div className="space-y-3 mb-4">
            <h3 className="text-noch-muted text-xs uppercase tracking-wide">Copy / Adapt fields</h3>
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Copy angle</label>
              <input
                value={adaptFields.copy_angle || ''}
                onChange={e => setAdaptFields(f => ({ ...f, copy_angle: e.target.value }))}
                placeholder="What angle will you rewrite for Noch brand?"
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50"
              />
            </div>
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Noch adaptation</label>
              <textarea
                value={adaptFields.noch_adaptation || ''}
                onChange={e => setAdaptFields(f => ({ ...f, noch_adaptation: e.target.value }))}
                rows={2}
                placeholder="How will this be made Noch-specific?"
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50 resize-none"
              />
            </div>
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Localization angle</label>
              <input
                value={adaptFields.localization_angle || ''}
                onChange={e => setAdaptFields(f => ({ ...f, localization_angle: e.target.value }))}
                placeholder="Libyan dialect, local references, regional context…"
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50"
              />
            </div>
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Copy risk level</label>
              <div className="flex gap-2">
                {COPY_RISK_LEVELS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setAdaptFields(f => ({ ...f, copy_risk_level: r.id }))}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      adaptFields.copy_risk_level === r.id
                        ? r.color === 'green' ? 'border-noch-green bg-noch-green/20 text-noch-green'
                          : r.color === 'amber' ? 'border-amber-400 bg-amber-400/20 text-amber-400'
                          : 'border-red-400 bg-red-400/20 text-red-400'
                        : 'border-noch-border text-noch-muted hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {adaptFields.copy_risk_level && adaptFields.copy_risk_level !== 'low' && (
              <div>
                <label className="text-noch-muted text-xs mb-1 block">Risk reason</label>
                <input
                  value={adaptFields.risk_reason || ''}
                  onChange={e => setAdaptFields(f => ({ ...f, risk_reason: e.target.value }))}
                  placeholder="Why is this risky to adapt?"
                  className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {adaptMode && (
            <button
              onClick={handleSaveAdaptation}
              disabled={savingAdapt}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
            >
              {savingAdapt ? <Loader2 size={14} className="animate-spin" /> : null}
              Save adaptation
            </button>
          )}
          <button
            onClick={handleCreateBriefFromInspiration}
            disabled={creatingBrief}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-noch-green text-noch-green font-medium text-sm disabled:opacity-50"
          >
            {creatingBrief ? <Loader2 size={14} className="animate-spin" /> : <FileEdit size={14} />}
            Create brief from this
          </button>
        </div>
      </section>
    </div>
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
