// UgcTab — Phase 7 moderation queue.
// Owner-only (route is gated upstream). Approves or rejects pending
// UGC photo submissions; reviews the consent box per row.

import { useEffect, useState } from 'react'
import { Image, Check, X, Loader2, ExternalLink, Filter } from 'lucide-react'
import { listUgcSubmissions, approveUgc, rejectUgc } from '../lib/marketing-supabase'
import toast from 'react-hot-toast'

const STATUSES = ['pending', 'approved', 'rejected', 'withdrawn']

export default function UgcTab() {
  const [tab, setTab] = useState('pending')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try { setList(await listUgcSubmissions(tab === 'all' ? null : tab)) }
    catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [tab])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Image size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Fan wall — submissions</h3>
          <span className="text-noch-muted text-xs">{list.length} {tab}</span>
        </div>
        <a
          href="https://noch.cloud/#/wall"
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
          title="Open the public wall in a new tab"
        >
          <ExternalLink size={11}/> Public wall
        </a>
      </div>

      <div className="flex gap-1.5 text-xs">
        <Filter size={12} className="text-noch-muted self-center" />
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-2.5 py-1 rounded-full border ${
              tab === s ? 'border-noch-green text-noch-green bg-noch-green/10' : 'border-noch-border text-noch-muted hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setTab('all')}
          className={`px-2.5 py-1 rounded-full border ${
            tab === 'all' ? 'border-noch-green text-noch-green bg-noch-green/10' : 'border-noch-border text-noch-muted hover:text-white'
          }`}
        >
          all
        </button>
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-12">Loading…</p>
      ) : list.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">
          <Image size={28} className="mx-auto mb-2"/>No {tab} submissions.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map(row => <UgcCard key={row.id} row={row} reload={reload} />)}
        </div>
      )}
    </div>
  )
}

function UgcCard({ row, reload }) {
  const [busy, setBusy] = useState(null)
  const [displayName, setDisplayName] = useState(row.display_name || row.loyalty_customers?.full_name?.split(' ')[0] || '')

  const customer = row.loyalty_customers || {}

  const approve = async () => {
    setBusy('approve')
    try { await approveUgc(row.id, displayName); toast.success('Approved'); reload() }
    catch (err) { toast.error(err.message || 'Approve failed') }
    finally { setBusy(null) }
  }
  const reject = async () => {
    const reason = prompt('Reason (optional, shown to customer):', '')
    if (reason === null) return
    setBusy('reject')
    try { await rejectUgc(row.id, reason); toast.success('Rejected'); reload() }
    catch (err) { toast.error(err.message || 'Reject failed') }
    finally { setBusy(null) }
  }

  return (
    <div className="card p-3 flex flex-col gap-2 text-xs">
      <div className="flex gap-3">
        <a href={row.photo_url} target="_blank" rel="noreferrer" className="block w-24 h-24 bg-noch-dark rounded-lg overflow-hidden shrink-0">
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            src={row.photo_url}
            className="w-full h-full object-cover"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        </a>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{customer.full_name || 'Unknown customer'}</p>
          <p className="text-noch-muted text-[11px]">
            {customer.tier || '—'}{customer.phone ? ` · ${customer.phone}` : ''}
          </p>
          {row.handle && <p className="text-noch-green text-[11px] mt-1">@{row.handle.replace(/^@/, '')}</p>}
          {row.caption && <p className="text-noch-muted mt-1 line-clamp-3">{row.caption}</p>}
          <p className="text-[10px] text-noch-muted/70 mt-1">
            {new Date(row.created_at).toLocaleString('en-GB')}
            {row.consent ? ' · ✓ consented' : ' · ✗ no consent'}
          </p>
          {row.status === 'rejected' && row.rejection_reason && (
            <p className="text-red-400 text-[11px] mt-1">Rejected: {row.rejection_reason}</p>
          )}
        </div>
      </div>

      {row.status === 'pending' && (
        <>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Display name on wall (optional)"
            className="input text-xs"
          />
          <div className="flex gap-2">
            <button onClick={approve} disabled={busy === 'approve'} className="btn-primary flex-1 text-xs flex items-center justify-center gap-1">
              {busy === 'approve' ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>} Approve
            </button>
            <button onClick={reject} disabled={busy === 'reject'} className="btn-secondary flex-1 text-xs flex items-center justify-center gap-1">
              {busy === 'reject' ? <Loader2 size={11} className="animate-spin"/> : <X size={11}/>} Reject
            </button>
          </div>
        </>
      )}

      {row.status !== 'pending' && (
        <span className={`self-start text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
          row.status === 'approved' ? 'bg-noch-green/20 text-noch-green' :
          row.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
          'bg-noch-card text-noch-muted'
        }`}>{row.status}</span>
      )}
    </div>
  )
}
