// ChannelAnalyticsTab.jsx — manual-first channel analytics roll-up.
// Each channel section shows latest snapshot vs prior; ΔWoW.

import { useEffect, useMemo, useState } from 'react'
import { Camera, ThumbsUp, MessageSquare, Globe, Music2, Plus, X } from 'lucide-react'
import { listChannelSnapshots, createChannelSnapshot, getWhatsappStats } from '../lib/marketing-supabase'
import toast from 'react-hot-toast'

const CHANNELS = [
  { key: 'instagram',       label: 'Instagram',         icon: Camera,    color: 'text-pink-400'   },
  { key: 'tiktok',          label: 'TikTok',            icon: Music2,    color: 'text-white'      },
  { key: 'facebook',        label: 'Facebook',          icon: ThumbsUp,  color: 'text-blue-400'   },
  { key: 'google_business', label: 'Google Business',   icon: Globe,     color: 'text-yellow-400' },
  { key: 'whatsapp',        label: 'WhatsApp',          icon: MessageSquare, color: 'text-green-400' },
]

function delta(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null
  return ((curr - prev) / prev) * 100
}
function fmtN(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k'
  return Math.round(n).toString()
}

export default function ChannelAnalyticsTab() {
  const [byChannel, setByChannel] = useState({})
  const [whatsappStats, setWhatsappStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showFormFor, setShowFormFor] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const all = await listChannelSnapshots({})
      const byCh = {}
      for (const s of all) {
        if (!byCh[s.channel]) byCh[s.channel] = []
        byCh[s.channel].push(s)
      }
      setByChannel(byCh)
      try { setWhatsappStats(await getWhatsappStats({})) } catch { /* ignore */ }
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-noch-muted text-xs">
        Manual entry is fine for v1. API connectors (IG Graph, GBP, TikTok) come in Phase 2.5 — they need OAuth setup with each platform.
      </p>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : CHANNELS.map(ch => {
        const list = byChannel[ch.key] || []
        const latest = list[0]
        const prior  = list[1]
        return (
          <div key={ch.key} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ch.icon size={16} className={ch.color} />
                <h3 className="text-white font-semibold">{ch.label}</h3>
                {!latest && <span className="text-noch-muted text-[11px]">no data yet</span>}
              </div>
              <button onClick={() => setShowFormFor(ch.key)} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
                <Plus size={11}/> Log snapshot
              </button>
            </div>
            {ch.key === 'whatsapp' && whatsappStats && (
              <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                <Mini label="Sent"      v={whatsappStats.sent} />
                <Mini label="Delivered" v={whatsappStats.delivered} />
                <Mini label="Read"      v={whatsappStats.read} />
                <Mini label="Failed"    v={whatsappStats.failed} color="text-red-400"/>
              </div>
            )}
            {latest ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Metric label="Followers"      curr={latest.followers}      prev={prior?.followers} />
                <Metric label="Reach"          curr={latest.reach}          prev={prior?.reach} />
                <Metric label="Profile visits" curr={latest.profile_visits} prev={prior?.profile_visits} />
                <Metric label="Engagement %"   curr={latest.engagement_rate} prev={prior?.engagement_rate} pct />
                {ch.key === 'google_business' && (
                  <>
                    <Metric label="Reviews"            curr={latest.review_count}        prev={prior?.review_count} />
                    <Metric label="Avg rating"        curr={latest.avg_rating}         prev={prior?.avg_rating} dp={2}/>
                    <Metric label="Direction reqs"    curr={latest.direction_requests}  prev={prior?.direction_requests} />
                    <Metric label="Phone calls"       curr={latest.phone_calls}         prev={prior?.phone_calls} />
                  </>
                )}
                <p className="col-span-full text-noch-muted text-[10px] mt-1">last logged {latest.snapshot_date}</p>
              </div>
            ) : <p className="text-noch-muted text-xs italic">No snapshots logged.</p>}
          </div>
        )
      })}

      {showFormFor && (
        <SnapshotFormModal channel={showFormFor} onClose={() => setShowFormFor(null)} onSaved={() => { setShowFormFor(null); reload() }} />
      )}
    </div>
  )
}

function Mini({ label, v, color }) {
  return (
    <div className="bg-noch-dark/50 rounded px-2 py-1">
      <p className="text-noch-muted text-[10px] uppercase">{label}</p>
      <p className={`font-mono ${color || 'text-white'}`}>{fmtN(v)}</p>
    </div>
  )
}

function Metric({ label, curr, prev, pct, dp = 0 }) {
  const d = delta(curr, prev)
  const dColor = d == null ? 'text-noch-muted' : d > 0 ? 'text-noch-green' : d < 0 ? 'text-red-400' : 'text-noch-muted'
  const big = curr != null && (pct ? `${Number(curr).toFixed(2)}%` : (dp > 0 ? Number(curr).toFixed(dp) : fmtN(curr)))
  return (
    <div>
      <p className="text-noch-muted text-[10px] uppercase">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <p className="text-white font-mono">{big || '—'}</p>
        {d != null && Math.abs(d) >= 20 && <p className={`text-[10px] ${dColor}`}>⚠ {d > 0 ? '+' : ''}{d.toFixed(0)}%</p>}
        {d != null && Math.abs(d) < 20 && <p className={`text-[10px] ${dColor}`}>{d > 0 ? '+' : ''}{d.toFixed(0)}%</p>}
      </div>
    </div>
  )
}

function SnapshotFormModal({ channel, onClose, onSaved }) {
  const meta = CHANNELS.find(c => c.key === channel)
  const [form, setForm] = useState({
    snapshot_date: new Date().toISOString().slice(0, 10),
    account_label: '',
    followers: '', reach: '', profile_visits: '', link_clicks: '', impressions: '', engagement_rate: '',
    review_count: '', avg_rating: '', direction_requests: '', phone_calls: '',
    messages_sent: '', messages_delivered: '', messages_read: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    try {
      const num = (k) => form[k] === '' ? null : Number(form[k])
      await createChannelSnapshot({
        channel,
        account_label: form.account_label || null,
        snapshot_date: form.snapshot_date,
        followers: num('followers'),
        reach: num('reach'),
        profile_visits: num('profile_visits'),
        link_clicks: num('link_clicks'),
        impressions: num('impressions'),
        engagement_rate: num('engagement_rate'),
        review_count: num('review_count'),
        avg_rating: num('avg_rating'),
        direction_requests: num('direction_requests'),
        phone_calls: num('phone_calls'),
        messages_sent: num('messages_sent'),
        messages_delivered: num('messages_delivered'),
        messages_read: num('messages_read'),
        source: 'manual',
      })
      toast.success(`${meta?.label} snapshot saved`)
      onSaved()
    } catch (err) { toast.error(err.message || 'Save failed') }
  }

  const fields = useMemo(() => {
    const generic = ['followers', 'reach', 'profile_visits', 'link_clicks', 'impressions', 'engagement_rate']
    if (channel === 'google_business') return [...generic, 'review_count', 'avg_rating', 'direction_requests', 'phone_calls']
    if (channel === 'whatsapp') return ['messages_sent', 'messages_delivered', 'messages_read']
    return generic
  }, [channel])

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">{meta?.label} snapshot</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label block mb-1">Date</label>
            <input type="date" className="input w-full" value={form.snapshot_date} onChange={e => set('snapshot_date', e.target.value)} />
          </div>
          <div>
            <label className="label block mb-1">Account label</label>
            <input className="input w-full" placeholder="@noch.cafe" value={form.account_label} onChange={e => set('account_label', e.target.value)} />
          </div>
          {fields.map(f => (
            <div key={f}>
              <label className="label block mb-1 capitalize">{f.replace(/_/g, ' ')}</label>
              <input type="number" step="0.01" className="input w-full" value={form[f]} onChange={e => set(f, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} className="btn-primary">Save</button>
        </div>
      </div>
    </div>
  )
}
