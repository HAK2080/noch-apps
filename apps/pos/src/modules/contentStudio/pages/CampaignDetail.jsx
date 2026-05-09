// CampaignDetail.jsx — Phase 6 campaign workbench.
// Edits the campaign + lists linked briefs (and surface drafts/bank
// via brief).

import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Megaphone, Save, Loader2, Trash2, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { getCampaign, updateCampaign, deleteCampaign, CAMPAIGN_STATUSES } from '../services/campaigns'
import { listBriefs } from '../services/briefs'

export default function CampaignDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [briefs, setBriefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const [c, b] = await Promise.all([getCampaign(id), listBriefs({ campaignId: id }).catch(() => [])])
      setCampaign(c); setBriefs(b || [])
    } catch (e) { toast.error(e.message || 'Load failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [id])

  const set = (k, v) => setCampaign(c => ({ ...c, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const row = await updateCampaign(id, campaign)
      setCampaign(row)
      toast.success('Saved')
    } catch (e) { toast.error(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('Delete this campaign? Linked briefs will detach (not be deleted).')) return
    try { await deleteCampaign(id); toast.success('Deleted'); navigate('/content-studio/campaigns') }
    catch (e) { toast.error(e.message || 'Failed') }
  }

  if (loading)  return <div className="text-noch-muted text-sm">Loading…</div>
  if (!campaign) return <div className="text-noch-muted text-sm">Not found</div>

  const platforms      = (campaign.platforms || []).join(', ')
  const contentPillars = (campaign.content_pillars || []).join(', ')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to="/content-studio/campaigns" className="flex items-center gap-1.5 text-noch-muted hover:text-white text-sm">
          <ArrowLeft size={14} /> Back to campaigns
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
          </button>
          <button onClick={remove} className="text-noch-muted hover:text-red-400 text-xs flex items-center gap-1">
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-noch-card border border-noch-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Megaphone size={14} className="text-noch-green" />
            <input
              value={campaign.name || ''}
              onChange={e => set('name', e.target.value)}
              className="bg-transparent text-white font-semibold text-base flex-1 outline-none border-b border-transparent focus:border-noch-green/40"
              placeholder="Campaign name"
            />
          </div>
          <Field label="Goal"><textarea rows={2} className={cls} value={campaign.goal || ''} onChange={e => set('goal', e.target.value)} /></Field>
          <Field label="Content mission"><textarea rows={2} className={cls} value={campaign.content_mission || ''} onChange={e => set('content_mission', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Audience segment"><input className={cls} value={campaign.audience_segment || ''} onChange={e => set('audience_segment', e.target.value)} /></Field>
            <Field label="Product focus"><input className={cls} value={campaign.product_focus || ''} onChange={e => set('product_focus', e.target.value)} /></Field>
            <Field label="Source signal"><input className={cls} value={campaign.source_signal || ''} onChange={e => set('source_signal', e.target.value)} /></Field>
            <Field label="Success metric"><input className={cls} value={campaign.success_metric || ''} onChange={e => set('success_metric', e.target.value)} placeholder="e.g. +15% Spanish Latte sales" /></Field>
            <Field label="Start date"><input type="date" className={cls} value={campaign.start_date || ''} onChange={e => set('start_date', e.target.value || null)} /></Field>
            <Field label="End date"><input type="date" className={cls} value={campaign.end_date || ''} onChange={e => set('end_date', e.target.value || null)} /></Field>
            <Field label="Platforms (comma-separated)"><input className={cls} value={platforms} onChange={e => set('platforms', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="instagram, tiktok, facebook" /></Field>
            <Field label="Content pillars (comma-separated)"><input className={cls} value={contentPillars} onChange={e => set('content_pillars', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></Field>
            <Field label="Status">
              <select className={cls} value={campaign.status} onChange={e => set('status', e.target.value)}>
                {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notes"><textarea rows={3} className={cls} value={campaign.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
        </div>

        {/* Linked briefs */}
        <div className="bg-noch-card border border-noch-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-noch-green" />
            <h3 className="text-white text-sm font-semibold">Linked briefs</h3>
            <span className="text-noch-muted text-xs">{briefs.length}</span>
          </div>
          {briefs.length === 0 ? (
            <p className="text-noch-muted text-xs">
              No briefs linked. Open a brief and pick this campaign in its Campaign field.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {briefs.map(b => (
                <li key={b.id}>
                  <Link to={`/content-studio/briefs/${b.id}`} className="block px-2 py-1.5 rounded-lg hover:bg-noch-green/10 border border-transparent hover:border-noch-green/30">
                    <p className="text-white text-xs line-clamp-1">{b.title || 'Untitled'}</p>
                    <p className="text-noch-muted text-[11px]">{b.status} · {b.nochi_format || b.platform || '—'}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

const cls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/60 focus:outline-none focus:border-noch-green'
function Field({ label, children }) {
  return <label className="block"><span className="block text-noch-muted text-[11px] mb-1">{label}</span>{children}</label>
}
