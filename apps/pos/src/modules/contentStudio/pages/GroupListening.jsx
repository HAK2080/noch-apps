import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ExternalLink, Loader2, MessageCircle, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { createInspiration } from '../services/inspirations'
import { ingestGroupMatch, loadGroupMatches, storeGroupMatches } from '../lib/groupListener'

export default function GroupListening() {
  const { businessId } = useOutletContext()
  const [rows, setRows] = useState(() => loadGroupMatches())
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = rows.find(row => row.id === selectedId) || rows[0]

  useEffect(() => {
    function receive(event) {
      if (event.source !== window || event.origin !== window.location.origin) return
      if (event.data?.source !== 'NOCH_GROUP_LISTENER_EXTENSION' || event.data?.type !== 'MATCH') return
      const id = event.data.match?.id
      try {
        const next = ingestGroupMatch(event.data.match)
        setRows(next)
        window.postMessage({ source: 'NOCH_GROUP_LISTENER_APP', id, ok: true }, window.location.origin)
      } catch (error) {
        window.postMessage({ source: 'NOCH_GROUP_LISTENER_APP', id, ok: false, error: error.message }, window.location.origin)
      }
    }
    window.addEventListener('message', receive)
    window.postMessage({ source: 'NOCH_GROUP_LISTENER_APP', type: 'READY' }, window.location.origin)
    return () => window.removeEventListener('message', receive)
  }, [])

  function update(patch) {
    const next = rows.map(row => row.id === selected.id ? { ...row, ...patch } : row)
    storeGroupMatches(next)
    setRows(next)
  }

  async function promote() {
    if (!businessId || !selected) return
    setBusy(true)
    try {
      const inspiration = await createInspiration({
        business_id: businessId, source_type: 'url',
        source_url: selected.url || selected.groupUrl,
        title: `${selected.groupName}: ${selected.text.slice(0, 90)}`,
        platform: 'facebook', source_text: selected.text, status: 'new',
      })
      update({ promotedBy: { ...(selected.promotedBy || {}), [businessId]: inspiration.id } })
      toast.success('Saved to Inspiration')
    } catch (error) { toast.error(error.message) }
    finally { setBusy(false) }
  }

  async function copyApproved() {
    if (!selected?.approvedReply || selected.approvedReply !== selected.replyDraft) return
    try { await navigator.clipboard.writeText(selected.approvedReply); toast.success('Approved reply copied') }
    catch { toast.error('Could not copy the reply') }
  }

  const visible = rows.filter(row => `${row.groupName} ${row.text} ${(row.keywords || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  return <div className="space-y-5">
    <header><h2 className="text-white text-xl font-bold flex items-center gap-2"><MessageCircle className="text-noch-green" />Facebook Groups</h2>
      <p className="text-noch-muted text-sm mt-1">Review matches from groups you visit. Replies stay here until you approve the exact text and post it yourself.</p></header>
    <div className="card space-y-2 text-sm"><p className="text-white font-medium">One-person listening pilot</p>
      <p className="text-noch-muted">Load the browser extension from <code>apps/pos/extension/group-listener</code>, add keywords and optional areas, and open a Facebook Group you have joined. Keep this page open to receive matches.</p>
      <p className="text-noch-muted">This inbox stays in this browser. Save a useful match to Inspiration to move it into Content Studio’s existing creative workflow.</p></div>
    <div className="grid lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] gap-4">
      <section className="card space-y-3"><label className="relative block"><Search size={15} className="absolute left-3 top-3 text-noch-muted" /><input className="input pl-9" placeholder="Search matches" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <p className="text-noch-muted text-xs">{visible.length} match{visible.length === 1 ? '' : 'es'}</p>
        <div className="space-y-2 max-h-[65vh] overflow-y-auto">{visible.map(row => <button key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full text-left rounded-lg p-3 border ${selected?.id === row.id ? 'border-noch-green bg-noch-green/10' : 'border-noch-border hover:border-noch-green/30'}`}><p className="text-white text-sm font-medium">{row.groupName}</p><p className="text-noch-muted text-xs line-clamp-2 mt-1" dir="auto">{row.text}</p><p className="text-noch-muted text-xs mt-2">{new Date(row.foundAt).toLocaleString()}</p></button>)}
          {!visible.length && <p className="text-noch-muted text-sm py-8 text-center">No matches yet. Open a joined group with the extension enabled.</p>}</div></section>
      {selected && <section className="card space-y-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-white font-semibold">{selected.groupName}</h3><p className="text-noch-muted text-xs">Matched: {[...(selected.keywords || []), ...(selected.areas || [])].join(', ') || 'filter'}</p></div><a className="btn-secondary" href={selected.url || selected.groupUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open post</a></div>
        <p className="text-white text-sm whitespace-pre-wrap" dir="auto">{selected.text}</p>
        <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={!businessId || busy || Boolean(selected.promotedBy?.[businessId])} onClick={promote}>{busy && <Loader2 className="animate-spin" size={15} />}{selected.promotedBy?.[businessId] ? 'Saved to Inspiration' : 'Save to Inspiration'}</button>{selected.promotedBy?.[businessId] && <Link className="btn-secondary" to={`/content-studio/inspiration/${selected.promotedBy[businessId]}`}>Open Inspiration</Link>}</div>
        <div className="border-t border-noch-border pt-4 space-y-2"><h4 className="text-white font-medium">Reply review</h4><textarea className="input min-h-28" placeholder="Write a reply in your own voice" value={selected.replyDraft || ''} onChange={event => update({ replyDraft: event.target.value, approvedReply: '' })} />
          <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={!selected.replyDraft?.trim()} onClick={() => update({ approvedReply: selected.replyDraft })}>Approve exact text</button><button className="btn-primary" disabled={!selected.approvedReply || selected.approvedReply !== selected.replyDraft} onClick={copyApproved}>Copy approved reply</button></div>
          <p className="text-noch-muted text-xs">Editing resets approval. Publishing happens manually on Facebook.</p></div>
        <div className="border-t border-noch-border pt-4 space-y-2"><h4 className="text-white font-medium">Conversation notes</h4><textarea id="incoming-note" className="input min-h-20" placeholder="Paste an incoming response or add a note after you post" /><button className="btn-secondary" onClick={() => { const field = document.getElementById('incoming-note'); const body = field?.value.trim(); if (!body) return; update({ history: [...(selected.history || []), { body, at: new Date().toISOString() }] }); field.value = '' }}>Add to history</button>
          {(selected.history || []).map((entry, index) => <p key={`${entry.at}-${index}`} className="text-sm text-noch-muted whitespace-pre-wrap border-l-2 border-noch-border pl-3" dir="auto">{entry.body}<span className="block text-xs mt-1">{new Date(entry.at).toLocaleString()}</span></p>)}</div>
      </section>}
    </div>
  </div>
}
