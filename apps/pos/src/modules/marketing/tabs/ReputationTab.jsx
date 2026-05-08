// ReputationTab — manual-entry inbox for reviews + comments. v1: log
// any external feedback with a status (new / replied / snoozed / flagged).

import { useEffect, useMemo, useState } from 'react'
import { Star, Plus, Reply, X, Check } from 'lucide-react'
import { listReviews, createReview, updateReview } from '../lib/marketing-supabase'
import toast from 'react-hot-toast'

const SOURCES = ['google','instagram','facebook','tiktok','whatsapp','manual']
const SENTIMENT = ['positive','neutral','negative','question']
const STATUSES  = ['new','replied','snoozed','flagged']

const STATUS_STYLE = {
  new:      { bg: 'bg-blue-500/15 text-blue-400 border-blue-500/40' },
  replied:  { bg: 'bg-noch-green/15 text-noch-green border-noch-green/40' },
  snoozed:  { bg: 'bg-noch-card text-noch-muted border-noch-border' },
  flagged:  { bg: 'bg-red-500/15 text-red-400 border-red-500/40' },
}
const SENT_STYLE = {
  positive: 'text-noch-green',
  neutral:  'text-noch-muted',
  negative: 'text-red-400',
  question: 'text-blue-400',
}

export default function ReputationTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('new')
  const [showAdd, setShowAdd] = useState(false)
  const [replying, setReplying] = useState(null)

  const reload = async () => {
    setLoading(true)
    try { setList(await listReviews({})) }
    catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const counts = useMemo(() => {
    const c = { new: 0, replied: 0, snoozed: 0, flagged: 0 }
    for (const r of list) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [list])

  const filtered = filter === 'all' ? list : list.filter(r => r.status === filter)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Reputation inbox</h3>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1 flex items-center gap-1"><Plus size={11}/> Log review</button>
      </div>

      <div className="flex gap-1 flex-wrap">
        <FilterChip k="all"     active={filter} onClick={setFilter} count={list.length}/>
        {STATUSES.map(s => <FilterChip key={s} k={s} active={filter} onClick={setFilter} count={counts[s] || 0}/>)}
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : filtered.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">No reviews{filter !== 'all' ? ` (${filter})` : ''} yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(r => (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-noch-muted">{r.source}</span>
                  {r.rating && <span className="text-yellow-400 text-xs">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span>}
                  <span className={`text-[10px] uppercase ${SENT_STYLE[r.sentiment] || 'text-noch-muted'}`}>{r.sentiment}</span>
                  <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]?.bg || 'bg-noch-card text-noch-muted border-noch-border'}`}>{r.status}</span>
                </div>
                <span className="text-noch-muted text-[10px]">{r.posted_at ? new Date(r.posted_at).toLocaleDateString('en-GB') : new Date(r.ingested_at).toLocaleDateString('en-GB')}</span>
              </div>
              <p className="text-noch-muted text-xs mb-1">{r.author_name || 'anon'}</p>
              <p className="text-white text-sm">{r.text}</p>
              {r.reply_text && (
                <div className="mt-2 pl-3 border-l-2 border-noch-green/40">
                  <p className="text-noch-green text-[10px] uppercase mb-0.5">your reply · {r.replied_at && new Date(r.replied_at).toLocaleDateString('en-GB')}</p>
                  <p className="text-noch-muted text-xs">{r.reply_text}</p>
                </div>
              )}
              <div className="flex gap-2 mt-2">
                {r.status !== 'replied' && <button onClick={() => setReplying(r)} className="btn-secondary text-[11px] px-2 py-0.5 flex items-center gap-1"><Reply size={10}/> Reply</button>}
                {r.status === 'new' && <button onClick={() => updateReview(r.id, { status: 'snoozed' }).then(reload)} className="text-noch-muted text-[11px] underline">snooze</button>}
                {r.status !== 'flagged' && <button onClick={() => updateReview(r.id, { status: 'flagged' }).then(reload)} className="text-red-400 text-[11px] underline">flag</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <ReviewForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload() }}/>}
      {replying && <ReplyForm review={replying} onClose={() => setReplying(null)} onSaved={() => { setReplying(null); reload() }}/>}
    </div>
  )
}

function FilterChip({ k, active, onClick, count }) {
  return (
    <button onClick={() => onClick(k)} className={`px-2.5 py-1 rounded text-[11px] border ${
      active === k ? 'bg-noch-green/15 border-noch-green/40 text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'
    }`}>{k} {count != null && <span className="opacity-70">({count})</span>}</button>
  )
}

function ReviewForm({ onClose, onSaved }) {
  const [f, setF] = useState({
    source: 'google', author_name: '', rating: 5, text: '', sentiment: 'positive', posted_at: new Date().toISOString().slice(0, 10),
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const submit = async () => {
    if (!f.text) return toast.error('Text required')
    try {
      await createReview({ ...f, posted_at: f.posted_at + 'T00:00:00Z', rating: Number(f.rating) })
      toast.success('Logged'); onSaved()
    } catch (err) { toast.error(err.message || 'Failed') }
  }
  return (
    <Modal onClose={onClose} title="Log review">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label block mb-1">Source</label>
          <select className="input w-full" value={f.source} onChange={e => set('source', e.target.value)}>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="label block mb-1">Sentiment</label>
          <select className="input w-full" value={f.sentiment} onChange={e => set('sentiment', e.target.value)}>{SENTIMENT.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="label block mb-1">Author</label>
          <input className="input w-full" value={f.author_name} onChange={e => set('author_name', e.target.value)} /></div>
        <div><label className="label block mb-1">Rating</label>
          <select className="input w-full" value={f.rating} onChange={e => set('rating', e.target.value)}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} ★</option>)}</select></div>
        <div className="col-span-2"><label className="label block mb-1">Text</label>
          <textarea rows={3} className="input w-full resize-none" value={f.text} onChange={e => set('text', e.target.value)} /></div>
        <div className="col-span-2"><label className="label block mb-1">Posted</label>
          <input type="date" className="input w-full" value={f.posted_at} onChange={e => set('posted_at', e.target.value)} /></div>
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={submit} className="btn-primary">Log</button>
      </div>
    </Modal>
  )
}

function ReplyForm({ review, onClose, onSaved }) {
  const [text, setText] = useState('')
  const submit = async () => {
    if (!text) return toast.error('Reply text required')
    try {
      await updateReview(review.id, { reply_text: text })
      toast.success('Reply saved'); onSaved()
    } catch (err) { toast.error(err.message || 'Failed') }
  }
  return (
    <Modal onClose={onClose} title={`Reply to ${review.author_name || review.source}`}>
      <p className="text-noch-muted text-xs italic mb-3">"{review.text?.slice(0, 200)}"</p>
      <textarea rows={5} className="input w-full resize-none" value={text} onChange={e => setText(e.target.value)} placeholder="Your reply…"/>
      <p className="text-noch-muted text-[11px] mt-2">v1: log the reply. Posting it on the source platform is still manual.</p>
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={submit} className="btn-primary"><Check size={11} className="inline mr-1"/>Save reply</button>
      </div>
    </Modal>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">{title}</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16}/></button>
        </div>
        {children}
      </div>
    </div>
  )
}
