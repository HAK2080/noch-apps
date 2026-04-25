import { useEffect, useState, useCallback, useMemo } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import {
  Sparkles, Loader2, ArrowRight, LayoutGrid, List,
  Link2, Image as ImageIcon, ClipboardPaste, StickyNote,
  ChevronDown, X,
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { listConcepts } from '../services/concepts'
import { usePageState } from '../../../lib/usePageState'
import { QUALITY_LABELS, QUALITY_COLORS, QUALITY_BG } from '../lib/conceptQuality'

const SOURCE_ICONS = {
  url: Link2,
  screenshot: ImageIcon,
  pasted_text: ClipboardPaste,
  note: StickyNote,
}

const STATUS_TONE = {
  draft:     'bg-zinc-500/10 text-zinc-400',
  generated: 'bg-blue-500/10 text-blue-400',
  edited:    'bg-amber-500/10 text-amber-400',
  approved:  'bg-noch-green/10 text-noch-green',
  rejected:  'bg-red-500/10 text-red-400',
  archived:  'bg-noch-border text-noch-muted',
}

const RISK_TONE = {
  low:      'bg-noch-green/10 text-noch-green',
  medium:   'bg-amber-500/10 text-amber-400',
  high:     'bg-red-500/10 text-red-400',
}

function riskTone(r) {
  if (!r) return 'bg-noch-border text-noch-muted'
  const key = r.toLowerCase()
  return RISK_TONE[key] || 'bg-zinc-500/10 text-zinc-400'
}

function safeHost(url) {
  try { return new URL(url).hostname } catch { return url }
}

// --- Filter pill ---
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer
          ${value
            ? 'bg-noch-green/10 border-noch-green/40 text-noch-green'
            : 'bg-noch-card border-noch-border text-noch-muted'
          }`}
      >
        <option value="">{label}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={11} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${value ? 'text-noch-green' : 'text-noch-muted'}`} />
    </div>
  )
}

export default function Concepts() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = usePageState('concepts:viewMode', () => {
    try { return localStorage.getItem('cs-concepts-view') || 'grid' } catch { return 'grid' }
  })
  const [filterBrand, setFilterBrand] = usePageState('concepts:filterBrand', '')
  const [filterVoice, setFilterVoice] = usePageState('concepts:filterVoice', '')
  const [filterNature, setFilterNature] = usePageState('concepts:filterNature', '')
  const [filterStatus, setFilterStatus] = usePageState('concepts:filterStatus', '')
  const [filterQuality, setFilterQuality] = usePageState('concepts:filterQuality', '')

  const refresh = useCallback(async () => {
    if (!businessId) { setItems([]); return }
    setLoading(true)
    try {
      const rows = await listConcepts({ businessId })
      setItems(rows)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [businessId])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    try { localStorage.setItem('cs-concepts-view', viewMode) } catch {}
  }, [viewMode])

  // Derive unique filter options from live data. Adds an "Unlabeled" bucket
  // for concepts missing the field so users can surface them and re-extract.
  const UNLABELED = '__unlabeled__'
  const uniqueOpts = (key) => {
    const vals = [...new Set(items.map(c => c[key]).filter(Boolean))].sort()
    const opts = vals.map(v => ({ value: v, label: v }))
    if (items.some(c => !c[key])) opts.push({ value: UNLABELED, label: '— Unlabeled —' })
    return opts
  }
  const brandOptions  = useMemo(() => uniqueOpts('source_brand'), [items])
  const voiceOptions  = useMemo(() => uniqueOpts('voice_type'),   [items])
  const natureOptions = useMemo(() => uniqueOpts('post_nature'),  [items])
  const statusOptions = useMemo(() => uniqueOpts('status'),       [items])

  const anyFilter = filterBrand || filterVoice || filterNature || filterStatus || filterQuality

  const QUALITY_FILTER_OPTIONS = [
    { value: 'weak',   label: 'Thin / Fair (1–2)' },
    { value: 'good',   label: 'Good (3)' },
    { value: 'strong', label: 'Strong / Sharp (4–5)' },
  ]

  const matchesField = (value, filter) => {
    if (!filter) return true
    if (filter === UNLABELED) return !value
    return value === filter
  }

  const matchesQuality = (score, filter) => {
    if (!filter) return true
    const s = score ?? 0
    if (filter === 'weak')   return s <= 2
    if (filter === 'good')   return s === 3
    if (filter === 'strong') return s >= 4
    return true
  }

  const filtered = useMemo(() => items.filter(c => {
    if (!matchesField(c.source_brand, filterBrand))  return false
    if (!matchesField(c.voice_type,   filterVoice))  return false
    if (!matchesField(c.post_nature,  filterNature)) return false
    if (!matchesField(c.status,       filterStatus)) return false
    if (!matchesQuality(c.quality_score, filterQuality)) return false
    return true
  }), [items, filterBrand, filterVoice, filterNature, filterStatus, filterQuality])

  function clearFilters() {
    setFilterBrand(''); setFilterVoice(''); setFilterNature(''); setFilterStatus(''); setFilterQuality('')
  }

  if (ctxLoading) return null
  if (!businesses?.length) {
    return <EmptyState icon={Sparkles} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  }
  if (!businessId) {
    return <EmptyState icon={Sparkles} title="Pick a business" description="Select one from the top of the page." />
  }
  if (loading) return <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No concepts yet"
        description="Open an inspiration and click Extract concept."
        ctaLabel="Go to Inspiration"
        ctaTo="/content-studio/inspiration"
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — view toggle always visible on its own row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-noch-muted">{filtered.length} / {items.length} concept{items.length === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-0.5 border border-noch-border rounded-xl p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            title="Grid view"
            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-noch-green/10 text-noch-green' : 'text-noch-muted hover:text-noch-green'}`}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            title="List view"
            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-noch-green/10 text-noch-green' : 'text-noch-muted hover:text-noch-green'}`}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Brand"   value={filterBrand}   onChange={setFilterBrand}   options={brandOptions}  />
        <FilterSelect label="Voice"   value={filterVoice}   onChange={setFilterVoice}   options={voiceOptions}  />
        <FilterSelect label="Nature"  value={filterNature}  onChange={setFilterNature}  options={natureOptions} />
        <FilterSelect label="Status"  value={filterStatus}  onChange={setFilterStatus}  options={statusOptions} />
        <FilterSelect label="Quality" value={filterQuality} onChange={setFilterQuality} options={QUALITY_FILTER_OPTIONS} />
        {anyFilter && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-noch-muted hover:text-white transition-colors px-2 py-1.5">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="text-noch-muted text-sm text-center py-8">No concepts match the current filters.</p>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => <ConceptTile key={c.id} c={c} />)}
        </div>
      ) : (
        <div className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-noch-border">
            {filtered.map(c => <ConceptRow key={c.id} c={c} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function ConceptTile({ c }) {
  const insp = c.inspiration || {}
  const SourceIcon = SOURCE_ICONS[insp.source_type] || StickyNote
  const statusTone = STATUS_TONE[c.status] || STATUS_TONE.draft

  return (
    <Link
      to={`/content-studio/concepts/${c.id}`}
      className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden hover:border-noch-green/40 transition-colors flex flex-col"
    >
      {/* Image or placeholder */}
      <div className="relative aspect-video bg-noch-dark flex items-center justify-center overflow-hidden">
        {insp.preview_image_url ? (
          <img src={insp.preview_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <SourceIcon size={28} className="text-noch-muted/30" />
        )}
        {/* Source badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded-lg px-2 py-1 text-[10px] text-white/80 backdrop-blur-sm">
          <SourceIcon size={10} />
          <span className="capitalize">{(insp.source_type || 'note').replace('_', ' ')}</span>
          {insp.platform && <span className="opacity-60">· {insp.platform}</span>}
        </div>
        {/* Status badge */}
        {c.status && (
          <div className={`absolute top-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-full capitalize backdrop-blur-sm ${statusTone}`}>
            {c.status}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-noch-muted text-[11px] truncate">{insp.title || (insp.source_url ? safeHost(insp.source_url) : 'Untitled')}</p>
        <p className="text-white text-sm font-medium line-clamp-2 leading-snug">{c.hook_summary || '(no hook yet)'}</p>
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {c.source_brand && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 truncate max-w-[140px] capitalize">{c.source_brand}</span>
          )}
          {c.voice_type && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 truncate max-w-[120px] capitalize">{c.voice_type}</span>
          )}
          {c.post_nature && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 capitalize">{c.post_nature}</span>
          )}
          {c.originality_risk && (
            <span
              title={c.originality_risk}
              className={`text-[10px] px-2 py-0.5 rounded-full capitalize max-w-[120px] truncate ${riskTone(c.originality_risk?.split(/[\s—-]/)[0]?.toLowerCase())}`}
            >
              {c.originality_risk?.split(/[\s—-]/)[0] || c.originality_risk}
            </span>
          )}
          {c.quality_score && (
            <span
              title={`Quality: ${QUALITY_LABELS[c.quality_score]}${c.quality_score_override ? ' (manual)' : ''}`}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${QUALITY_BG[c.quality_score]} ${QUALITY_COLORS[c.quality_score]}`}
            >
              {QUALITY_LABELS[c.quality_score]}
            </span>
          )}
          {c.edited_by_user && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-noch-border text-noch-muted">edited</span>
          )}
        </div>
      </div>
    </Link>
  )
}

function ConceptRow({ c }) {
  const insp = c.inspiration || {}
  const SourceIcon = SOURCE_ICONS[insp.source_type] || StickyNote
  const statusTone = STATUS_TONE[c.status] || STATUS_TONE.draft

  return (
    <Link
      to={`/content-studio/concepts/${c.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
    >
      {/* Thumbnail */}
      <div className="w-14 h-10 rounded-lg bg-noch-dark flex-shrink-0 overflow-hidden flex items-center justify-center border border-noch-border">
        {insp.preview_image_url ? (
          <img src={insp.preview_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <SourceIcon size={14} className="text-noch-muted/40" />
        )}
      </div>

      {/* Main text */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{c.hook_summary || '(no hook)'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <SourceIcon size={10} className="text-noch-muted flex-shrink-0" />
          <p className="text-noch-muted text-xs truncate">{insp.title || (insp.source_url ? safeHost(insp.source_url) : 'Untitled')}</p>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {c.source_brand && (
          <span className="hidden lg:inline text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 max-w-[100px] truncate capitalize">{c.source_brand}</span>
        )}
        {c.voice_type && (
          <span className="hidden md:inline text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 max-w-[100px] truncate capitalize">{c.voice_type}</span>
        )}
        {c.post_nature && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 capitalize">{c.post_nature}</span>
        )}
        {c.originality_risk && (
          <span
            title={c.originality_risk}
            className={`hidden sm:inline text-[10px] px-2 py-0.5 rounded-full capitalize max-w-[90px] truncate ${riskTone(c.originality_risk?.split(/[\s—-]/)[0]?.toLowerCase())}`}
          >
            {c.originality_risk?.split(/[\s—-]/)[0] || c.originality_risk}
          </span>
        )}
        {c.quality_score && (
          <span
            title={`Quality: ${QUALITY_LABELS[c.quality_score]}`}
            className={`hidden sm:inline text-[10px] px-2 py-0.5 rounded-full font-medium ${QUALITY_BG[c.quality_score]} ${QUALITY_COLORS[c.quality_score]}`}
          >
            {QUALITY_LABELS[c.quality_score]}
          </span>
        )}
        {c.status && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${statusTone}`}>{c.status}</span>
        )}
      </div>

      <ArrowRight size={13} className="text-noch-muted flex-shrink-0" />
    </Link>
  )
}
