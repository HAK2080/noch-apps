// CampaignsTab — Phase 6 (consent-gated WhatsApp + manual approval).
//
// Three Phase 6 segments backed by SQL RPCs that filter to
// whatsapp_opt_in = true:
//   - birthday_this_week  — birthday in next 7 days
//   - inactive            — 30+ days since last visit, ≥3 lifetime visits
//   - reward_ready        — has a pending loyalty_rewards row
//
// Legacy RFM segments (vip / regular / at_risk / etc.) still appear in
// the dropdown for backward compat — they use marketing_opt_in only.
//
// Workflow: draft → preview recipients → owner approves → send. Each
// send invokes the send-whatsapp edge function and is logged via
// record_whatsapp_send for dedupe + audit.

import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Plus, Send, X, ShieldCheck, Loader2, Cake, Clock, Gift } from 'lucide-react'
import {
  listCampaigns, createCampaign, updateCampaign,
  loadSegmentRecipients, dispatchWhatsAppCampaign, approveCampaign, renderTemplate,
} from '../lib/marketing-supabase'
import SegmentBadge from '../components/SegmentBadge'
import toast from 'react-hot-toast'

const PHASE6_SEGMENTS = [
  { id: 'birthday_this_week', label: 'Birthday this week', icon: Cake, defaultName: 'Birthday — this week', defaultTemplate: '🎂 {{name}}، عيد ميلاد سعيد من نوتشي! تعالي خذي مشروبك المفضل ({{drink}}) هدية مننا 🎁' },
  { id: 'inactive',           label: 'Inactive 30+ days', icon: Clock, defaultName: 'Inactive — win-back', defaultTemplate: '👋 {{name}}، نوتشي بيشتاقلك! آخر زيارتك من {{days}} يوم. تعالي نقعد ونشرب {{drink}} مع بعض ☕' },
  { id: 'reward_ready',       label: 'Reward ready',      icon: Gift, defaultName: 'Reward — ready to claim', defaultTemplate: '🎁 {{name}}، عندك مشروب مجاني بانتظارك. تعالي اطلبي {{drink}} ولا تخلي نوتشي يستنى!' },
]

const LEGACY_SEGMENTS = ['vip','regular','occasional','at_risk','churned','new','all']
const CHANNELS = ['whatsapp','sms','email','manual','in_app']

export default function CampaignsTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [presetSegment, setPresetSegment] = useState(null)

  const reload = async () => {
    setLoading(true)
    try { setList(await listCampaigns()) }
    catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const openWith = (segId) => { setPresetSegment(segId); setShowAdd(true) }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Megaphone size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Campaigns</h3>
          <span className="text-noch-muted text-xs">{list.length} total</span>
        </div>
        <button onClick={() => { setPresetSegment(null); setShowAdd(true) }} className="btn-primary text-xs px-3 py-1 flex items-center gap-1"><Plus size={11}/> New campaign</button>
      </div>

      {/* Quick-launch tiles for the three Phase 6 segments. All tap into
          consent-gated RPCs and the staff-approval workflow. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {PHASE6_SEGMENTS.map(s => (
          <button
            key={s.id}
            onClick={() => openWith(s.id)}
            className="card flex items-center gap-3 px-3 py-3 text-left hover:bg-noch-card/70 transition-colors"
          >
            <s.icon size={18} className="text-noch-green shrink-0" />
            <div>
              <p className="text-white text-sm font-medium">{s.label}</p>
              <p className="text-noch-muted text-[11px]">Consent-gated · WhatsApp</p>
            </div>
          </button>
        ))}
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : list.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">
          <Megaphone size={28} className="mx-auto mb-2"/>No campaigns yet. Pick a tile above to launch one.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Name</th>
                <th className="text-left py-1 pr-2">Segment</th>
                <th className="text-left py-1 pr-2">Channel</th>
                <th className="text-left py-1 pr-2">Status</th>
                <th className="text-right py-1 pr-2">Recipients</th>
                <th className="text-right py-1 pr-2">Sent / Failed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <CampaignRow key={c.id} c={c} reload={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <CampaignForm
          presetSegment={presetSegment}
          onClose={() => { setShowAdd(false); setPresetSegment(null) }}
          onSaved={() => { setShowAdd(false); setPresetSegment(null); reload() }}
        />
      )}
    </div>
  )
}

function CampaignRow({ c, reload }) {
  const [busy, setBusy] = useState(null) // 'approve' | 'send'
  const [progress, setProgress] = useState(null)

  const isPhase6 = PHASE6_SEGMENTS.some(s => s.id === c.segment)

  const approve = async () => {
    setBusy('approve')
    try {
      await approveCampaign(c.id)
      toast.success('Approved — ready to send')
      reload()
    } catch (err) { toast.error(err.message || 'Approve failed') }
    finally { setBusy(null) }
  }

  const sendNow = async () => {
    if (c.channel !== 'whatsapp') { toast.error('Only WhatsApp campaigns can be sent from here'); return }
    if (!isPhase6) { toast.error('Legacy RFM segments must use the manual workflow'); return }
    if (!confirm(`Send this campaign now? Recipients are computed fresh from "${c.segment}". This cannot be undone.`)) return
    setBusy('send'); setProgress({ sent: 0, failed: 0, total: 0 })
    try {
      const result = await dispatchWhatsAppCampaign({
        campaignId: c.id,
        segment: c.segment,
        segmentArgs: c.segment === 'inactive' ? { days: 30 } : {},
        template: c.message_template,
        onProgress: (p) => setProgress({ sent: p.sent, failed: p.failed, total: p.total }),
      })
      toast.success(`Sent ${result.sent}/${result.total} (${result.failed} failed)`)
      reload()
    } catch (err) { toast.error(err.message || 'Send failed') }
    finally { setBusy(null); setProgress(null) }
  }

  return (
    <tr className="border-t border-noch-border/40">
      <td className="py-1.5 pr-2 text-white">{c.name}</td>
      <td className="py-1.5 pr-2"><SegmentBadge segment={c.segment}/></td>
      <td className="py-1.5 pr-2 text-noch-muted">{c.channel}</td>
      <td className="py-1.5 pr-2">
        <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
          c.status === 'sent' ? 'bg-noch-green/20 text-noch-green' :
          c.status === 'sending' ? 'bg-yellow-500/20 text-yellow-400' :
          c.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
          c.status === 'failed' ? 'bg-red-500/20 text-red-400' :
          c.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
          'bg-noch-card text-noch-muted'
        }`}>{c.status}</span>
      </td>
      <td className="py-1.5 pr-2 text-right text-noch-muted">{c.recipients_count ?? '—'}</td>
      <td className="py-1.5 pr-2 text-right text-noch-muted">
        {progress ? `${progress.sent}/${progress.total}` : (c.sent_count ? `${c.sent_count}` : '—')}
        {(c.failed_count > 0 || progress?.failed > 0) && (
          <span className="text-red-400 ml-1">/ {progress?.failed ?? c.failed_count} ✗</span>
        )}
      </td>
      <td className="py-1.5 text-right whitespace-nowrap">
        {c.status === 'draft' && (
          <button onClick={approve} disabled={busy === 'approve'} className="text-blue-400 text-[11px] inline-flex items-center gap-1 mr-2">
            {busy === 'approve' ? <Loader2 size={11} className="animate-spin"/> : <ShieldCheck size={11}/>} approve
          </button>
        )}
        {c.status === 'approved' && c.channel === 'whatsapp' && isPhase6 && (
          <button onClick={sendNow} disabled={busy === 'send'} className="text-noch-green text-[11px] inline-flex items-center gap-1">
            {busy === 'send' ? <Loader2 size={11} className="animate-spin"/> : <Send size={11}/>} send now
          </button>
        )}
        {c.status === 'sending' && (
          <span className="text-yellow-400 text-[11px] inline-flex items-center gap-1">
            <Loader2 size={11} className="animate-spin"/> sending
          </span>
        )}
      </td>
    </tr>
  )
}

function CampaignForm({ presetSegment, onClose, onSaved }) {
  const initialPreset = useMemo(
    () => PHASE6_SEGMENTS.find(s => s.id === presetSegment),
    [presetSegment]
  )

  const [f, setF] = useState({
    name:    initialPreset?.defaultName || '',
    segment: presetSegment || 'inactive',
    channel: 'whatsapp',
    message_template: initialPreset?.defaultTemplate || '',
    promo_code: '',
    cost_lyd: '',
    expected_revenue_lyd: '',
    scheduled_for: '',
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const [recipientCount, setRecipientCount] = useState(null)
  const [recipientPreview, setRecipientPreview] = useState([])
  const [loading, setLoading] = useState(false)

  const isPhase6 = PHASE6_SEGMENTS.some(s => s.id === f.segment)

  const previewRecipients = async () => {
    setLoading(true)
    try {
      const r = await loadSegmentRecipients(f.segment, f.segment === 'inactive' ? { days: 30 } : {})
      setRecipientCount(r.length)
      setRecipientPreview(r.slice(0, 6))
    } catch (err) {
      setRecipientCount(0); setRecipientPreview([])
      toast.error(err.message || 'Preview failed')
    } finally { setLoading(false) }
  }

  const submit = async (alsoApprove = false) => {
    if (!f.name) return toast.error('Name required')
    if (f.channel === 'whatsapp' && !f.message_template) return toast.error('Message template required for WhatsApp')
    try {
      const created = await createCampaign({
        name: f.name, segment: f.segment, channel: f.channel,
        message_template: f.message_template || null,
        promo_code: f.promo_code || null,
        cost_lyd: Number(f.cost_lyd) || 0,
        expected_revenue_lyd: Number(f.expected_revenue_lyd) || 0,
        scheduled_for: f.scheduled_for || null,
        recipients_count: recipientCount ?? null,
        status: 'draft',
      })
      if (alsoApprove) {
        try { await approveCampaign(created.id); toast.success('Saved + approved') }
        catch { toast.success('Saved as draft (approve from list)') }
      } else {
        toast.success('Campaign saved as draft')
      }
      onSaved()
    } catch (err) { toast.error(err.message || 'Save failed') }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">New campaign</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16}/></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label block mb-1">Name</label>
            <input className="input w-full" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Reward — ready to claim" /></div>
          <div><label className="label block mb-1">Segment</label>
            <select className="input w-full" value={f.segment} onChange={e => { set('segment', e.target.value); setRecipientCount(null); setRecipientPreview([]) }}>
              <optgroup label="Phase 6 (consent-gated)">
                {PHASE6_SEGMENTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
              <optgroup label="Legacy RFM (marketing_opt_in)">
                {LEGACY_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            </select></div>
          <div><label className="label block mb-1">Channel</label>
            <select className="input w-full" value={f.channel} onChange={e => set('channel', e.target.value)}>
              {CHANNELS.map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div className="col-span-2">
            <button onClick={previewRecipients} className="text-noch-green text-xs underline">
              {loading ? 'Loading…' : 'Preview recipients'}
            </button>
            {recipientCount != null && (
              <span className="text-noch-muted text-xs ml-2">{recipientCount} recipients</span>
            )}
            {recipientPreview.length > 0 && (
              <div className="mt-2 bg-noch-dark border border-noch-border rounded-lg p-2 text-[11px] space-y-0.5 max-h-28 overflow-y-auto">
                {recipientPreview.map(r => (
                  <div key={r.id} className="flex justify-between gap-2">
                    <span className="text-white truncate">{r.full_name}</span>
                    <span className="text-noch-muted">{r.phone}</span>
                  </div>
                ))}
                {recipientCount > recipientPreview.length && (
                  <p className="text-noch-muted/70 text-[10px]">+ {recipientCount - recipientPreview.length} more…</p>
                )}
              </div>
            )}
          </div>
          <div className="col-span-2"><label className="label block mb-1">Message template</label>
            <textarea rows={3} className="input w-full resize-none font-mono text-xs"
              value={f.message_template}
              onChange={e => set('message_template', e.target.value)}
              placeholder="Hi {{name}} — your {{drink}} is on us today 🎁"
            />
            <p className="text-noch-muted text-[10px] mt-1">Placeholders: <code>{'{{name}}'}</code> · <code>{'{{drink}}'}</code> · <code>{'{{days}}'}</code> (inactive segment only)</p>
            {f.message_template && recipientPreview[0] && (
              <p className="text-noch-green text-[11px] mt-1">
                Preview: {renderTemplate(f.message_template, recipientPreview[0])}
              </p>
            )}
          </div>
          <div><label className="label block mb-1">Promo code (optional)</label>
            <input className="input w-full" value={f.promo_code} onChange={e => set('promo_code', e.target.value.toUpperCase())} placeholder="MATCHA20" /></div>
          <div><label className="label block mb-1">Cost (LYD)</label>
            <input type="number" step="0.01" className="input w-full" value={f.cost_lyd} onChange={e => set('cost_lyd', e.target.value)} /></div>
        </div>

        <p className="text-noch-muted text-[11px] mt-3">
          {isPhase6
            ? 'Phase 6: only customers with whatsapp_opt_in = true are reached. Approve in the list, then click "send now" to dispatch via WhatsApp.'
            : 'Legacy RFM segment — uses marketing_opt_in. Sending must happen manually outside this app.'
          }
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => submit(false)} className="btn-secondary">Save draft</button>
          {isPhase6 && f.channel === 'whatsapp' && (
            <button onClick={() => submit(true)} className="btn-primary">
              <ShieldCheck size={11} className="inline mr-1"/>Save + approve
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
