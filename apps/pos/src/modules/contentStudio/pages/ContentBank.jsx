import { useEffect, useState, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Library, Loader2, Search, Copy, Archive, Activity, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../components/EmptyState'
import { listBankItems, archiveBankItem, updateBankItemPerformance } from '../services/contentBank'
import { recordSignal } from '../services/learningSignals'
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

              <PerfPanel item={item} onSaved={refresh} />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

const selCls = 'bg-noch-card border border-noch-border rounded-lg px-2 py-1.5 text-white text-sm'
function fmtDate(d) { try { return new Date(d).toLocaleDateString() } catch { return '' } }

// Phase 7 — Performance entry per bank item.
// Stays collapsed by default; expand to record posted_at, channel
// metrics, and qualitative ratings. Save also writes a learning
// signal (high_performing / weak_hook / strong_product_push / …)
// based on the entered values, so the learning loop benefits.
function PerfPanel({ item, onSaved }) {
  const has = item.posted_at != null || item.perf_views != null || item.hook_rating != null
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [v, setV] = useState({
    posted_at:        item.posted_at?.slice(0, 16) || '',
    perf_platform:    item.perf_platform || item.platform || '',
    perf_format:      item.perf_format   || item.format   || '',
    perf_views:       item.perf_views ?? '',
    perf_likes:       item.perf_likes ?? '',
    perf_comments:    item.perf_comments ?? '',
    perf_shares:      item.perf_shares ?? '',
    perf_saves:       item.perf_saves ?? '',
    perf_profile_visits: item.perf_profile_visits ?? '',
    perf_orders_before:  item.perf_orders_before ?? '',
    perf_orders_after:   item.perf_orders_after ?? '',
    perf_loyalty_visits_after: item.perf_loyalty_visits_after ?? '',
    perf_notes:       item.perf_notes || '',
    perf_worked_because: item.perf_worked_because || '',
    perf_did_not_work_because: item.perf_did_not_work_because || '',
    hook_rating:      item.hook_rating ?? '',
    creative_rating:  item.creative_rating ?? '',
    business_impact_rating: item.business_impact_rating ?? '',
  })
  const set = (k, val) => setV(s => ({ ...s, [k]: val }))

  // Derive learning signals from a perf entry.
  const deriveSignals = (saved) => {
    const out = []
    const hi = (a, b) => Number.isFinite(a) && a >= b
    const lo = (a, b) => Number.isFinite(a) && a <= b
    if (hi(saved.business_impact_rating, 4) || hi(saved.creative_rating, 4)) out.push('high_performing_content')
    if (lo(saved.business_impact_rating, 2) && lo(saved.creative_rating, 2)) out.push('low_performing_content')
    if (hi(saved.hook_rating, 4)) out.push('strong_hook')
    if (lo(saved.hook_rating, 2)) out.push('weak_hook')
    if (Number.isFinite(saved.perf_orders_after) && Number.isFinite(saved.perf_orders_before)
      && saved.perf_orders_after > saved.perf_orders_before * 1.15) out.push('strong_product_push')
    if (Number.isFinite(saved.perf_orders_after) && Number.isFinite(saved.perf_orders_before)
      && saved.perf_orders_after < saved.perf_orders_before * 0.85) out.push('weak_product_push')
    // Dialect signals: derived from the worked / did_not_work qualitative
    // notes when the owner mentions language/dialect explicitly.
    const dialectKeyword = /(dialect|libyan|tripoli|arabic|msa|lehji|ليبي|طرابلس|لهجة)/i
    if (saved.perf_worked_because && dialectKeyword.test(saved.perf_worked_because)) out.push('good_dialect')
    if (saved.perf_did_not_work_because && dialectKeyword.test(saved.perf_did_not_work_because)) out.push('bad_dialect')
    return out
  }

  const save = async () => {
    setSaving(true)
    try {
      const saved = await updateBankItemPerformance(item.id, {
        ...v,
        posted_at: v.posted_at ? new Date(v.posted_at).toISOString() : null,
      })
      const signals = deriveSignals(saved)
      for (const kind of signals) {
        try {
          await recordSignal({
            kind,
            source: 'content_bank_perf',
            content_bank_item_id: item.id,
            business_id: item.business_id || null,
            brand_voice_profile_id: item.brand_voice_profile_id || null,
            payload: { hook_rating: saved.hook_rating, creative_rating: saved.creative_rating, business_impact_rating: saved.business_impact_rating },
          })
        } catch (e) { /* non-fatal */ }
      }
      toast.success(signals.length ? `Saved · ${signals.length} learning signal${signals.length === 1 ? '' : 's'}` : 'Saved')
      onSaved?.()
    } catch (e) { toast.error(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="mt-3 border-t border-noch-border pt-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 text-noch-muted hover:text-white"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Activity size={11} className="text-noch-green" />
        <span>Performance</span>
        {has && <span className="ml-1 text-noch-green text-[10px]">· tracked</span>}
        {has && Number.isFinite(item.business_impact_rating) && (
          <span className="ml-auto text-yellow-400">{item.business_impact_rating}/5 impact</span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <PField label="Posted at"><input type="datetime-local" className={pcls} value={v.posted_at} onChange={e => set('posted_at', e.target.value)} /></PField>
            <PField label="Platform"><input className={pcls} value={v.perf_platform} onChange={e => set('perf_platform', e.target.value)} /></PField>
            <PField label="Format"><input className={pcls} value={v.perf_format} onChange={e => set('perf_format', e.target.value)} /></PField>
            <PField label="Views"><input type="number" className={pcls} value={v.perf_views} onChange={e => set('perf_views', e.target.value)} /></PField>
            <PField label="Likes"><input type="number" className={pcls} value={v.perf_likes} onChange={e => set('perf_likes', e.target.value)} /></PField>
            <PField label="Comments"><input type="number" className={pcls} value={v.perf_comments} onChange={e => set('perf_comments', e.target.value)} /></PField>
            <PField label="Shares"><input type="number" className={pcls} value={v.perf_shares} onChange={e => set('perf_shares', e.target.value)} /></PField>
            <PField label="Saves"><input type="number" className={pcls} value={v.perf_saves} onChange={e => set('perf_saves', e.target.value)} /></PField>
            <PField label="Profile visits"><input type="number" className={pcls} value={v.perf_profile_visits} onChange={e => set('perf_profile_visits', e.target.value)} /></PField>
            <PField label="Orders before"><input type="number" className={pcls} value={v.perf_orders_before} onChange={e => set('perf_orders_before', e.target.value)} /></PField>
            <PField label="Orders after"><input type="number" className={pcls} value={v.perf_orders_after} onChange={e => set('perf_orders_after', e.target.value)} /></PField>
            <PField label="Loyalty visits after"><input type="number" className={pcls} value={v.perf_loyalty_visits_after} onChange={e => set('perf_loyalty_visits_after', e.target.value)} /></PField>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <PRating label="Hook" value={v.hook_rating} onChange={x => set('hook_rating', x)} />
            <PRating label="Creative" value={v.creative_rating} onChange={x => set('creative_rating', x)} />
            <PRating label="Impact" value={v.business_impact_rating} onChange={x => set('business_impact_rating', x)} />
          </div>

          <PField label="Worked because…">
            <textarea rows={2} className={pcls} value={v.perf_worked_because} onChange={e => set('perf_worked_because', e.target.value)} />
          </PField>
          <PField label="Did not work because…">
            <textarea rows={2} className={pcls} value={v.perf_did_not_work_because} onChange={e => set('perf_did_not_work_because', e.target.value)} />
          </PField>
          <PField label="Notes">
            <textarea rows={2} className={pcls} value={v.perf_notes} onChange={e => set('perf_notes', e.target.value)} />
          </PField>

          <button
            onClick={save}
            disabled={saving}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : null}
            Save performance
          </button>
        </div>
      )}
    </div>
  )
}

const pcls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-noch-green'
function PField({ label, children }) {
  return <label className="block"><span className="block text-noch-muted/80 text-[10px] mb-0.5">{label}</span>{children}</label>
}
function PRating({ label, value, onChange }) {
  return (
    <div>
      <p className="text-noch-muted/80 text-[10px] mb-0.5">{label}</p>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(n => {
          const active = Number(value) === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? '' : n)}
              className={`w-5 h-5 rounded-full text-[10px] font-bold border ${
                active ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                       : 'border-noch-border text-noch-muted/40'
              }`}
            >{n}</button>
          )
        })}
      </div>
    </div>
  )
}
