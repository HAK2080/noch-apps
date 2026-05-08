// CampaignsTab — pick segment → write message → send via WhatsApp →
// track redemptions tied to pos_orders via promo_code.

import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Plus, Send, X } from 'lucide-react'
import { listCampaigns, createCampaign, updateCampaign, loadSegmentRecipients } from '../lib/marketing-supabase'
import SegmentBadge from '../components/SegmentBadge'
import toast from 'react-hot-toast'

const SEGMENTS = ['vip','regular','occasional','at_risk','churned','new','all']
const CHANNELS = ['whatsapp','sms','email','manual','in_app']

export default function CampaignsTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const reload = async () => {
    setLoading(true)
    try { setList(await listCampaigns()) }
    catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Megaphone size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Campaigns</h3>
          <span className="text-noch-muted text-xs">{list.length} total</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1 flex items-center gap-1"><Plus size={11}/> New campaign</button>
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : list.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">
          <Megaphone size={28} className="mx-auto mb-2"/>No campaigns yet. Create one to nudge a segment.
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
                <th className="text-left py-1 pr-2">Code</th>
                <th className="text-right py-1 pr-2">Cost</th>
                <th className="text-left py-1 pr-2">Scheduled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-white">{c.name}</td>
                  <td className="py-1.5 pr-2"><SegmentBadge segment={c.segment}/></td>
                  <td className="py-1.5 pr-2 text-noch-muted">{c.channel}</td>
                  <td className="py-1.5 pr-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                      c.status === 'sent' ? 'bg-noch-green/20 text-noch-green' :
                      c.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                      c.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                      'bg-noch-card text-noch-muted'
                    }`}>{c.status}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-noch-green font-mono">{c.promo_code || '—'}</td>
                  <td className="py-1.5 pr-2 text-right">{Number(c.cost_lyd || 0).toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="py-1.5 text-right">
                    {c.status === 'draft' && (
                      <button onClick={() => updateCampaign(c.id, { status: 'scheduled', scheduled_for: c.scheduled_for || new Date().toISOString() }).then(reload)} className="text-noch-green text-[11px]">schedule</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <CampaignForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload() }}/>}
    </div>
  )
}

function CampaignForm({ onClose, onSaved }) {
  const [f, setF] = useState({
    name: '', segment: 'at_risk', channel: 'whatsapp',
    message_template: '', promo_code: '', cost_lyd: '', expected_revenue_lyd: '',
    scheduled_for: '',
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const [recipientCount, setRecipientCount] = useState(null)

  const previewRecipients = async () => {
    try { const r = await loadSegmentRecipients(f.segment); setRecipientCount(r.length) }
    catch { setRecipientCount('?') }
  }

  const submit = async () => {
    if (!f.name) return toast.error('Name required')
    try {
      await createCampaign({
        name: f.name, segment: f.segment, channel: f.channel,
        message_template: f.message_template || null,
        promo_code: f.promo_code || null,
        cost_lyd: Number(f.cost_lyd) || 0,
        expected_revenue_lyd: Number(f.expected_revenue_lyd) || 0,
        scheduled_for: f.scheduled_for || null,
        status: 'draft',
      })
      toast.success('Campaign saved as draft'); onSaved()
    } catch (err) { toast.error(err.message || 'Save failed') }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">New campaign</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label block mb-1">Name</label>
            <input className="input w-full" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. May At-Risk Win-Back" /></div>
          <div><label className="label block mb-1">Segment</label>
            <select className="input w-full" value={f.segment} onChange={e => { set('segment', e.target.value); setRecipientCount(null) }}>
              {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div><label className="label block mb-1">Channel</label>
            <select className="input w-full" value={f.channel} onChange={e => set('channel', e.target.value)}>
              {CHANNELS.map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
          <div className="col-span-2">
            <button onClick={previewRecipients} className="text-noch-green text-xs underline">Preview recipient count</button>
            {recipientCount != null && <span className="text-noch-muted text-xs ml-2">{recipientCount} recipients</span>}
          </div>
          <div className="col-span-2"><label className="label block mb-1">Message template</label>
            <textarea rows={3} className="input w-full resize-none" value={f.message_template} onChange={e => set('message_template', e.target.value)} placeholder="Hi {{name}} — we miss you. Show this code at the counter for a free matcha: {{code}}" /></div>
          <div><label className="label block mb-1">Promo code</label>
            <input className="input w-full" value={f.promo_code} onChange={e => set('promo_code', e.target.value.toUpperCase())} placeholder="MATCHA20" /></div>
          <div><label className="label block mb-1">Cost (LYD)</label>
            <input type="number" step="0.01" className="input w-full" value={f.cost_lyd} onChange={e => set('cost_lyd', e.target.value)} /></div>
          <div className="col-span-2"><label className="label block mb-1">Schedule for</label>
            <input type="datetime-local" className="input w-full" value={f.scheduled_for} onChange={e => set('scheduled_for', e.target.value)} /></div>
        </div>
        <p className="text-noch-muted text-[11px] mt-3">v1: campaigns save as drafts. Sending happens manually via WhatsApp template + promo code; redemption is detected when an order uses the code.</p>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} className="btn-primary"><Send size={11} className="inline mr-1"/>Save draft</button>
        </div>
      </div>
    </div>
  )
}
