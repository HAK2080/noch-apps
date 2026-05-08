import { useEffect, useState, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Library, Loader2, Search, Copy, Archive } from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../components/EmptyState'
import { listBankItems, archiveBankItem } from '../services/contentBank'
import { FORMATS, PLATFORMS } from '../lib/constants'

export default function ContentBank() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [platform, setPlatform] = useState('')
  const [format, setFormat] = useState('')
  const [pillar, setPillar] = useState('')
  const [status, setStatus] = useState('approved')
  const [search, setSearch] = useState('')

  const refresh = useCallback(async () => {
    if (!businessId) { setItems([]); return }
    setLoading(true)
    try {
      const rows = await listBankItems({
        businessId,
        platform: platform || undefined,
        format: format || undefined,
        status: status || undefined,
        search: search.trim() || undefined,
      })
      setItems(rows)
    } catch (e) { console.error(e); toast.error(e.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [businessId, platform, format, status, search])

  useEffect(() => { refresh() }, [refresh])

  const pillarOptions = useMemo(
    () => Array.from(new Set(items.map(i => i.content_pillar).filter(Boolean))),
    [items],
  )
  const filtered = pillar ? items.filter(i => i.content_pillar === pillar) : items

  async function handleArchive(id) {
    try {
      await archiveBankItem(id)
      setItems(prev => prev.filter(i => i.id !== id))
      toast.success('Archived')
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed'),
    )
  }

  if (ctxLoading) return null
  if (!businesses?.length) return <EmptyState icon={Library} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  if (!businessId) return <EmptyState icon={Library} title="Pick a business" />

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 bg-noch-card border border-noch-border rounded-lg px-2 py-1">
          <Search size={14} className="text-noch-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search text…"
            className="bg-transparent text-white text-sm focus:outline-none w-40"
          />
        </div>
        <select value={platform} onChange={e => setPlatform(e.target.value)} className={selCls}>
          <option value="">All platforms</option>
          {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={format} onChange={e => setFormat(e.target.value)} className={selCls}>
          <option value="">All formats</option>
          {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {pillarOptions.length > 0 && (
          <select value={pillar} onChange={e => setPillar(e.target.value)} className={selCls}>
            <option value="">All pillars</option>
            {pillarOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select value={status} onChange={e => setStatus(e.target.value)} className={selCls}>
          <option value="approved">Approved</option>
          <option value="archived">Archived</option>
          <option value="">All</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Content Bank is empty"
          description="Approve drafts from the workbench to snapshot them here for reuse."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(item => (
            <article key={item.id} className="bg-noch-card border border-noch-border rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                <span className="text-noch-muted">
                  {item.format?.replace('_', ' ')}{item.platform && ` · ${item.platform}`}
                  {item.content_pillar && ` · ${item.content_pillar}`}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-noch-border text-noch-muted capitalize">{item.status}</span>
              </div>
              <p className="text-white text-sm whitespace-pre-wrap mb-2">{item.final_text}</p>
              {item.hashtags?.length > 0 && (
                <p className="text-noch-green/80 text-xs mb-2">{item.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}</p>
              )}
              <div className="flex items-center justify-between text-[11px] text-noch-muted">
                <span>{item.voice?.name || 'no voice'} · {fmtDate(item.approved_at)}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => copy(item.final_text)} className="hover:text-white flex items-center gap-1"><Copy size={12} /> Copy</button>
                  {item.status !== 'archived' && (
                    <button onClick={() => handleArchive(item.id)} className="hover:text-red-400 flex items-center gap-1"><Archive size={12} /> Archive</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

const selCls = 'bg-noch-card border border-noch-border rounded-lg px-2 py-1.5 text-white text-sm'
function fmtDate(d) { try { return new Date(d).toLocaleDateString() } catch { return '' } }
