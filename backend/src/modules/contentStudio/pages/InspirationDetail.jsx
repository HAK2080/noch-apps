import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Sparkles, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getInspiration, updateInspiration, deleteInspiration } from '../services/inspirations'
import { getConceptByInspirationId, createConcept, updateConcept } from '../services/concepts'
import { extractConcept } from '../ai/extractConcept'
import ConceptFields from '../components/ConceptFields'

export default function InspirationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [inspiration, setInspiration] = useState(null)
  const [concept, setConcept] = useState(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
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
        originality_risk: fields.originality_risk || null,
        notes: fields.notes || null,
        ai_model: result?.ai_model || null,
        status: 'draft',
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
