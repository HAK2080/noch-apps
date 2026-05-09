// BriefDetail.jsx — Phase 2 brief workbench. Edit fields, score
// quality, link to upstream artefacts, and generate drafts directly
// from this brief.

import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Sparkles, Loader2, Trash2, Save, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getBrief, updateBrief, deleteBrief, BRIEF_STATUSES, computeBriefQuality } from '../services/briefs'
import { listVoiceProfiles } from '../services/voiceProfiles'
import { listCampaigns } from '../services/campaigns'
import { generateDraftsFromBrief } from '../ai/generateDrafts'
import { createDraft } from '../services/drafts'

const RUBRIC = [
  { id: 'q_objective_clarity',    label: 'Objective clarity' },
  { id: 'q_audience_clarity',     label: 'Audience clarity' },
  { id: 'q_nochi_fit',            label: 'Nochi fit' },
  { id: 'q_local_relevance',      label: 'Local relevance (Tripoli)' },
  { id: 'q_business_value',       label: 'Business value' },
  { id: 'q_execution_simplicity', label: 'Execution simplicity' },
]

export default function BriefDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [brief, setBrief] = useState(null)
  const [voices, setVoices] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [voiceId, setVoiceId] = useState(null)
  const [n, setN] = useState(3)
  const [draftCount, setDraftCount] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [b, v, c] = await Promise.all([
        getBrief(id),
        listVoiceProfiles().catch(() => []),
        listCampaigns().catch(() => []),
      ])
      setBrief(b)
      setVoices(v || [])
      setCampaigns(c || [])
      if (!voiceId && v?.[0]) setVoiceId(v[0].id)
    } catch (e) { toast.error(e.message || 'Load failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [id])

  const set = (k, v) => setBrief(b => ({ ...b, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const quality_score = computeBriefQuality(brief)
      const patch = { ...brief, quality_score }
      delete patch.concept; delete patch.inspiration; delete patch.campaign
      const row = await updateBrief(id, patch)
      setBrief(row)
      toast.success('Saved')
    } catch (e) { toast.error(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('Delete this brief?')) return
    try { await deleteBrief(id); toast.success('Deleted'); navigate('/content-studio/briefs') }
    catch (e) { toast.error(e.message || 'Failed') }
  }

  const generate = async () => {
    if (!voiceId) { toast.error('Pick a voice profile first'); return }
    const voiceProfile = voices.find(v => v.id === voiceId)
    setGenerating(true); setDraftCount(null)
    try {
      const result = await generateDraftsFromBrief({ brief, voiceProfile, n })
      const drafts = result?.drafts || result?.variants || []
      // Persist each generated draft, attached to this brief.
      const created = []
      for (const d of drafts) {
        try {
          const row = await createDraft({
            brief_id: brief.id,
            concept_id: result.concept_id || brief.reference_concept_id || null,
            brand_voice_profile_id: voiceId,
            platform: brief.platform || 'instagram',
            format:   brief.format   || 'reel',
            language: brief.language || 'ar',
            text_caption: d.caption || d.text || d.caption_final || '',
            hook:         d.hook    || null,
            cta:          d.cta     || null,
            hashtags:     d.hashtags || null,
            ai_model:     result.ai_model || null,
            generation_meta: { brief_id: brief.id, ...d._meta },
            status: 'draft',
          })
          created.push(row)
        } catch (e) { console.warn('Draft persist failed:', e) }
      }
      setDraftCount(created.length)
      // Auto-bump status to 'used' once drafts have been generated.
      if (brief.status === 'draft' || brief.status === 'ready') {
        const updated = await updateBrief(id, { status: 'used' })
        setBrief(updated)
      }
      toast.success(`Generated ${created.length} draft${created.length === 1 ? '' : 's'}`)
    } catch (e) { toast.error(e.message || 'Generation failed') }
    finally { setGenerating(false) }
  }

  if (loading) return <div className="text-noch-muted text-sm">Loading…</div>
  if (!brief)  return <div className="text-noch-muted text-sm">Not found</div>

  const score = computeBriefQuality(brief)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to="/content-studio/briefs" className="flex items-center gap-1.5 text-noch-muted hover:text-white text-sm">
          <ArrowLeft size={14} /> Back to briefs
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-noch-card border border-noch-border text-noch-muted">
            {brief.status}
          </span>
          <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
          </button>
          <button onClick={remove} className="text-noch-muted hover:text-red-400 text-xs flex items-center gap-1">
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left + middle: editable fields (2/3) */}
        <div className="lg:col-span-2 bg-noch-card border border-noch-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-noch-green" />
            <input
              value={brief.title || ''}
              onChange={e => set('title', e.target.value)}
              className="bg-transparent text-white font-semibold text-base flex-1 outline-none border-b border-transparent focus:border-noch-green/40"
              placeholder="Brief title"
            />
          </div>

          <Field label="Objective"><textarea rows={2} className={cls} value={brief.objective || ''} onChange={e => set('objective', e.target.value)} placeholder="What is this brief trying to achieve?" /></Field>
          <Field label="Content mission"><textarea rows={2} className={cls} value={brief.content_mission || ''} onChange={e => set('content_mission', e.target.value)} /></Field>
          <Field label="Customer signal"><textarea rows={2} className={cls} value={brief.customer_signal || ''} onChange={e => set('customer_signal', e.target.value)} placeholder="What did the customer/data tell us?" /></Field>
          <Field label="Target audience"><input className={cls} value={brief.target_audience || ''} onChange={e => set('target_audience', e.target.value)} /></Field>
          <Field label="Product focus"><input className={cls} value={brief.product_focus || ''} onChange={e => set('product_focus', e.target.value)} placeholder="e.g. Spanish Latte, all drinks, breakfast" /></Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Emotional angle"><input className={cls} value={brief.emotional_angle || ''} onChange={e => set('emotional_angle', e.target.value)} /></Field>
            <Field label="Content pillar"><input className={cls} value={brief.content_pillar || ''} onChange={e => set('content_pillar', e.target.value)} /></Field>
            <Field label="Nochi format"><input className={cls} value={brief.nochi_format || ''} onChange={e => set('nochi_format', e.target.value)} /></Field>
            <Field label="CTA style"><input className={cls} value={brief.cta_style || ''} onChange={e => set('cta_style', e.target.value)} placeholder="soft, direct, none" /></Field>
            <Field label="Platform"><input className={cls} value={brief.platform || ''} onChange={e => set('platform', e.target.value)} /></Field>
            <Field label="Format"><input className={cls} value={brief.format || ''} onChange={e => set('format', e.target.value)} placeholder="reel, post, story" /></Field>
            <Field label="Language"><input className={cls} value={brief.language || ''} onChange={e => set('language', e.target.value)} /></Field>
            <Field label="Dialect"><input className={cls} value={brief.dialect || ''} onChange={e => set('dialect', e.target.value)} placeholder="libyan, msa…" /></Field>
          </div>

          <Field label="Notes"><textarea rows={3} className={cls} value={brief.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Status">
              <select className={cls} value={brief.status} onChange={e => set('status', e.target.value)}>
                {BRIEF_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Copy risk level">
              <select className={cls} value={brief.copy_risk_level || ''} onChange={e => set('copy_risk_level', e.target.value || null)}>
                <option value="">—</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
              </select>
            </Field>
            <Field label="Campaign">
              <select className={cls} value={brief.campaign_id || ''} onChange={e => set('campaign_id', e.target.value || null)}>
                <option value="">—</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Right column (1/3): rubric + linkage + generate */}
        <div className="space-y-4">
          {/* Quality rubric */}
          <div className="bg-noch-card border border-noch-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-yellow-400" />
              <h3 className="text-white text-sm font-semibold flex-1">Quality rubric</h3>
              {score && <span className="text-yellow-400 text-xs font-bold">{score}/5</span>}
            </div>
            <div className="space-y-2">
              {RUBRIC.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-noch-muted text-[11px] flex-1">{r.label}</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => {
                      const active = brief[r.id] === n
                      return (
                        <button
                          key={n}
                          onClick={() => set(r.id, active ? null : n)}
                          className={`w-5 h-5 rounded-full text-[10px] font-bold border ${
                            active ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                                   : 'border-noch-border text-noch-muted/40'
                          }`}
                        >{n}</button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upstream linkage */}
          {(brief.inspiration || brief.concept) && (
            <div className="bg-noch-card border border-noch-border rounded-2xl p-4 text-xs">
              <h3 className="text-white text-sm font-semibold mb-2">Source</h3>
              {brief.source_signal_type && (
                <p className="text-noch-muted mb-1">↳ {brief.source_signal_type.replace('_', ' ')}</p>
              )}
              {brief.inspiration && (
                <Link to={`/content-studio/inspiration/${brief.inspiration.id}`} className="text-noch-green hover:underline block">
                  Inspiration: {brief.inspiration.title || 'Untitled'}
                </Link>
              )}
              {brief.concept && (
                <Link to={`/content-studio/concepts/${brief.concept.id}`} className="text-noch-green hover:underline block mt-1">
                  Concept: {brief.concept.hook_summary?.slice(0, 60) || 'Linked concept'}
                </Link>
              )}
            </div>
          )}

          {/* Generate drafts */}
          <div className="bg-noch-card border border-noch-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wand2 size={14} className="text-noch-green" />
              <h3 className="text-white text-sm font-semibold">Generate drafts</h3>
            </div>
            <div className="space-y-2 text-xs">
              <Field label="Voice profile">
                <select className={cls} value={voiceId || ''} onChange={e => setVoiceId(e.target.value)}>
                  <option value="">— pick —</option>
                  {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
              <Field label="How many drafts">
                <input type="number" min={1} max={6} className={cls} value={n} onChange={e => setN(Math.max(1, Math.min(6, Number(e.target.value) || 3)))} />
              </Field>
              <button onClick={generate} disabled={generating || !voiceId} className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-1">
                {generating ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                {generating ? 'Generating…' : 'Generate drafts'}
              </button>
              {draftCount != null && (
                <p className="text-noch-green text-[11px] text-center">
                  ✓ {draftCount} draft{draftCount === 1 ? '' : 's'} created.{' '}
                  <Link to="/content-studio/drafts" className="underline">View drafts</Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const cls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/60 focus:outline-none focus:border-noch-green'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-noch-muted text-[11px] mb-1">{label}</span>
      {children}
    </label>
  )
}
