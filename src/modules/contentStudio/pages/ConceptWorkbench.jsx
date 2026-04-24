import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Sparkles, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { getConcept, updateConcept } from '../services/concepts'
import { listVoiceProfiles } from '../services/voiceProfiles'
import { listDrafts, createDraft } from '../services/drafts'
import { generateDrafts } from '../ai/generateDrafts'
import ConceptFields from '../components/ConceptFields'
import DraftVariantCard from '../components/DraftVariantCard'
import { FORMATS, PLATFORMS } from '../lib/constants'

export default function ConceptWorkbench() {
  const { id } = useParams()
  const [concept, setConcept] = useState(null)
  const [voices, setVoices] = useState([])
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [savingConcept, setSavingConcept] = useState(false)

  const [voiceId, setVoiceId] = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [format, setFormat] = useState('short_post')
  const [count, setCount] = useState(3)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const c = await getConcept(id)
      setConcept(c)
      const businessId = c?.inspiration?.business_id
      const [vs, ds] = await Promise.all([
        businessId ? listVoiceProfiles(businessId) : Promise.resolve([]),
        listDrafts({ conceptId: id }),
      ])
      setVoices(vs)
      setDrafts(ds)
      const def = vs.find(v => v.is_default) || vs[0]
      if (def && !voiceId) setVoiceId(def.id)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function handleSaveConcept(values) {
    setSavingConcept(true)
    try {
      const row = await updateConcept(concept.id, values)
      setConcept(c => ({ ...c, ...row }))
      toast.success('Saved')
    } catch (e) { toast.error(e.message || 'Save failed') }
    finally { setSavingConcept(false) }
  }

  async function handleGenerate() {
    if (!voiceId) return toast.error('Pick a voice profile')
    const voiceProfile = voices.find(v => v.id === voiceId)
    setGenerating(true)
    try {
      const result = await generateDrafts({ concept, voiceProfile, platform, format, n: count })
      const variants = result?.variants || []
      const created = []
      for (const v of variants) {
        const row = await createDraft({
          concept_id: concept.id,
          brand_voice_profile_id: voiceId,
          platform,
          format,
          body_text: v.body || '',
          hook: v.hook || null,
          cta: v.cta || null,
          hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
          generation_params: { n: count, ai_model: result.ai_model },
          source: 'ai',
          status: 'generated',
        })
        created.push(row)
      }
      setDrafts(d => [...created, ...d])
      toast.success(`${created.length} drafts generated`)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function handleDraftChanged(updated) {
    setDrafts(prev => {
      const exists = prev.find(d => d.id === updated.id)
      if (exists) return prev.map(d => d.id === updated.id ? { ...d, ...updated } : d)
      return [updated, ...prev]
    })
  }

  if (loading) return <div className="text-noch-muted text-sm">Loading…</div>
  if (!concept) return <div className="text-noch-muted text-sm">Not found</div>

  const insp = concept.inspiration
  const activeVoice = voices.find(v => v.id === voiceId)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/content-studio/concepts" className="flex items-center gap-1.5 text-noch-muted hover:text-white text-sm">
          <ArrowLeft size={14} /> Back to concepts
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Source */}
        <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-3">Source</h2>
          {insp ? (
            <div className="space-y-3">
              <p className="text-noch-muted text-xs uppercase tracking-wide">{insp.source_type?.replace('_', ' ')}</p>
              <h3 className="text-white font-medium">{insp.title || 'Untitled'}</h3>
              {insp.preview_image_url && (
                <img src={insp.preview_image_url} alt="" className="w-full rounded-lg border border-noch-border" />
              )}
              {insp.source_url && (
                <a href={insp.source_url} target="_blank" rel="noreferrer" className="text-noch-green text-sm break-all block">
                  {insp.source_url}
                </a>
              )}
              {insp.source_text && (
                <pre className="bg-noch-dark border border-noch-border rounded-lg p-2 text-white text-xs whitespace-pre-wrap font-sans max-h-60 overflow-y-auto">
{insp.source_text}
                </pre>
              )}
              <Link to={`/content-studio/inspiration/${insp.id}`} className="text-noch-muted text-xs hover:text-white">Open inspiration →</Link>
            </div>
          ) : <p className="text-noch-muted text-sm">No source linked</p>}
        </section>

        {/* Concept */}
        <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-3">Concept</h2>
          <ConceptFields concept={concept} onSave={handleSaveConcept} saving={savingConcept} />
        </section>

        {/* Drafts + Generator */}
        <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-3">Drafts</h2>

          <div className="bg-noch-dark border border-noch-border rounded-lg p-3 mb-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Voice">
                <select value={voiceId} onChange={e => setVoiceId(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {voices.map(v => <option key={v.id} value={v.id}>{v.name}{v.is_default ? ' ★' : ''}</option>)}
                </select>
              </Field>
              <Field label="Platform">
                <select value={platform} onChange={e => setPlatform(e.target.value)} className={inputCls}>
                  {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Format">
                <select value={format} onChange={e => setFormat(e.target.value)} className={inputCls}>
                  {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="How many">
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={count}
                  onChange={e => setCount(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                  className={inputCls}
                />
              </Field>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !voiceId}
              className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate drafts
            </button>
            {voices.length === 0 && (
              <p className="text-amber-400 text-xs">No voice profiles yet — <Link to={`/content-studio/businesses/${insp?.business_id}`} className="underline">add one</Link>.</p>
            )}
          </div>

          {drafts.length === 0 ? (
            <div className="text-noch-muted text-sm text-center py-6 border border-dashed border-noch-border rounded-lg">
              No drafts yet. Configure above and generate.
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map(d => (
                <DraftVariantCard key={d.id} draft={d} voiceProfile={activeVoice} onChanged={handleDraftChanged} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-noch-card border border-noch-border rounded-md px-2 py-1 text-white text-xs'
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-noch-muted text-[11px] mb-0.5">{label}</span>
      {children}
    </label>
  )
}
