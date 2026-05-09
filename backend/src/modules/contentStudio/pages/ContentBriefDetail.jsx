import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { getBrief, updateBrief, deleteBrief } from '../services/creativeBriefs'
import { BRIEF_STATUSES, PLATFORMS, FORMATS } from '../lib/constants'

const FIELDS = [
  { key: 'objective',       label: 'Objective',         placeholder: 'What is this content supposed to achieve?' },
  { key: 'content_mission', label: 'Content mission',   placeholder: 'Core message or story angle' },
  { key: 'target_audience', label: 'Target audience',   placeholder: 'Who is this for?' },
  { key: 'product_focus',   label: 'Product focus',     placeholder: 'Which product or service?' },
  { key: 'customer_signal', label: 'Customer signal',   placeholder: 'Real customer feedback or behaviour' },
  { key: 'emotional_angle', label: 'Emotional angle',   placeholder: 'What feeling should this create?' },
  { key: 'content_pillar',  label: 'Content pillar',    placeholder: 'Education / Humor / Proof / etc.' },
  { key: 'nochi_format',    label: 'Noch format',       placeholder: 'Storytelling style or recurring format' },
  { key: 'cta_style',       label: 'CTA style',         placeholder: 'Soft / Direct / Community / etc.' },
  { key: 'notes',           label: 'Notes',             placeholder: 'Any additional notes or context', multiline: true },
]

export default function ContentBriefDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [brief, setBrief] = useState(null)
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const row = await getBrief(id)
      setBrief(row)
      setForm({
        objective:        row.objective        || '',
        content_mission:  row.content_mission  || '',
        target_audience:  row.target_audience  || '',
        product_focus:    row.product_focus    || '',
        customer_signal:  row.customer_signal  || '',
        emotional_angle:  row.emotional_angle  || '',
        content_pillar:   row.content_pillar   || '',
        nochi_format:     row.nochi_format     || '',
        cta_style:        row.cta_style        || '',
        platform:         row.platform         || '',
        format:           row.format           || '',
        language:         row.language         || 'ar',
        dialect:          row.dialect          || 'libyan-tripoli',
        risk_level:       row.risk_level       || '',
        source_signal_type: row.source_signal_type || '',
        notes:            row.notes            || '',
        status:           row.status           || 'draft',
      })
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateBrief(id, form)
      setBrief(updated)
      toast.success('Brief saved')
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this brief?')) return
    try {
      await deleteBrief(id)
      toast.success('Deleted')
      navigate('/content-studio/briefs')
    } catch (e) {
      toast.error(e.message || 'Delete failed')
    }
  }

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  if (loading) return <div className="text-noch-muted text-sm">Loading…</div>
  if (!brief) return <div className="text-noch-muted text-sm">Not found</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <Link
          to="/content-studio/briefs"
          className="flex items-center gap-1.5 text-noch-muted hover:text-white text-sm"
        >
          <ArrowLeft size={14} /> Back to briefs
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-noch-muted hover:text-red-400 text-sm"
          >
            <Trash2 size={14} /> Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main fields */}
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-4">
            <h2 className="text-white font-semibold">Brief details</h2>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="text-noch-muted text-xs mb-1 block">{f.label}</label>
                {f.multiline ? (
                  <textarea
                    value={form[f.key] || ''}
                    onChange={e => set(f.key, e.target.value)}
                    rows={3}
                    placeholder={f.placeholder}
                    className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50 resize-none"
                  />
                ) : (
                  <input
                    value={form[f.key] || ''}
                    onChange={e => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50"
                  />
                )}
              </div>
            ))}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-3">
            <h2 className="text-white font-semibold">Publishing</h2>

            <div>
              <label className="text-noch-muted text-xs mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
              >
                {BRIEF_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className="text-noch-muted text-xs mb-1 block">Platform</label>
              <select
                value={form.platform}
                onChange={e => set('platform', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">— Pick platform —</option>
                {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-noch-muted text-xs mb-1 block">Format</label>
              <select
                value={form.format}
                onChange={e => set('format', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">— Pick format —</option>
                {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-noch-muted text-xs mb-1 block">Risk level</label>
              <div className="flex gap-2">
                {['low', 'medium', 'high'].map(r => (
                  <button
                    key={r}
                    onClick={() => set('risk_level', r)}
                    className={`flex-1 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      form.risk_level === r
                        ? r === 'low'    ? 'border-noch-green bg-noch-green/20 text-noch-green'
                          : r === 'medium' ? 'border-amber-400 bg-amber-400/20 text-amber-400'
                          : 'border-red-400 bg-red-400/20 text-red-400'
                        : 'border-noch-border text-noch-muted hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Linked references */}
          {(brief.reference_inspiration_id || brief.reference_concept_id) && (
            <section className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-2">
              <h2 className="text-white font-semibold text-sm">Linked from</h2>
              {brief.reference_inspiration_id && (
                <Link
                  to={`/content-studio/inspiration/${brief.reference_inspiration_id}`}
                  className="block text-noch-green text-xs hover:underline"
                >
                  Inspiration ↗
                </Link>
              )}
              {brief.reference_concept_id && (
                <Link
                  to={`/content-studio/concepts/${brief.reference_concept_id}`}
                  className="block text-noch-green text-xs hover:underline"
                >
                  Concept ↗
                </Link>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
