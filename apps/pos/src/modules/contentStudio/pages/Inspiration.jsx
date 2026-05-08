import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Lightbulb, Plus, Loader2, Sparkles, Trash2, LayoutGrid, List, CheckSquare, Square, X, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../components/EmptyState'
import InspirationCard from '../components/InspirationCard'
import AddInspirationModal from '../components/AddInspirationModal'
import { listInspirations, updateInspiration, deleteInspiration } from '../services/inspirations'
import { getConceptByInspirationId, createConcept, updateConcept } from '../services/concepts'
import { extractConcept } from '../ai/extractConcept'
import { INSPIRATION_STATUSES } from '../lib/constants'
import { usePageState } from '../../../lib/usePageState'

export default function Inspiration() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [statusFilter, setStatusFilter] = usePageState('inspiration:statusFilter', '')
  const [batchProgress, setBatchProgress] = useState(null)
  const [viewMode, setViewMode] = usePageState('inspiration:viewMode', () => {
    try { return localStorage.getItem('cs-inspiration-view') || 'grid' } catch { return 'grid' }
  })
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState(null) // { alreadyExtracted: [...], fresh: [...] }

  const refresh = useCallback(async () => {
    if (!businessId) { setItems([]); return }
    setLoading(true)
    try {
      const rows = await listInspirations({ businessId, status: statusFilter || undefined })
      setItems(rows)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [businessId, statusFilter])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    try { localStorage.setItem('cs-inspiration-view', viewMode) } catch {}
  }, [viewMode])

  // Exiting select mode clears selection
  useEffect(() => { if (!selectMode) setSelected(new Set()) }, [selectMode])

  function toggle(id) {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() { setSelected(new Set(items.map(i => i.id))) }
  function clearSelection() { setSelected(new Set()) }

  const allSelected = items.length > 0 && selected.size === items.length

  async function handleBatchExtract(overwriteExtracted = false) {
    const pool = selectMode && selected.size > 0 ? items.filter(it => selected.has(it.id)) : items
    const alreadyExtracted = pool.filter(it => it.status === 'extracted')
    const fresh = pool.filter(it => it.status !== 'extracted')

    // If user has selected already-extracted items and hasn't confirmed overwrite yet, prompt.
    if (!overwriteExtracted && alreadyExtracted.length > 0) {
      setConfirmOverwrite({ alreadyExtracted, fresh })
      return
    }

    const target = overwriteExtracted ? pool : fresh
    if (!target.length) return toast(selectMode ? 'Selected items already extracted' : 'All inspirations already extracted')
    setConfirmOverwrite(null)
    setBatchProgress({ done: 0, total: target.length, failed: 0 })
    let done = 0, failed = 0
    for (const inspiration of target) {
      try {
        const result = await extractConcept({ inspiration })
        const fields = result?.concept || result || {}
        const existing = await getConceptByInspirationId(inspiration.id)
        const payload = {
          inspiration_id: inspiration.id,
          hook_summary: fields.hook_summary || null,
          content_pattern: fields.content_pattern || null,
          emotional_driver: fields.emotional_driver || null,
          target_audience: fields.target_audience || null,
          why_it_works: fields.why_it_works || null,
          reusable_mechanism: fields.reusable_mechanism || null,
          originality_risk: fields.originality_risk || 'low',
          source_brand: fields.source_brand || null,
          voice_type: fields.voice_type || null,
          post_nature: fields.post_nature || null,
          notes: fields.notes || null,
          ai_model: result?.ai_model || null,
          // Preserve any approved/rejected/archived status set by user — only default to 'draft' on first create
          status: existing ? (existing.status || 'draft') : 'draft',
        }
        if (existing) await updateConcept(existing.id, { ...payload, edited_by_user: false })
        else await createConcept(payload)
        await updateInspiration(inspiration.id, { status: 'extracted' })
        done++
      } catch (e) {
        console.error('Batch extract failed for', inspiration.id, e)
        failed++
      }
      setBatchProgress({ done: done + failed, total: target.length, failed })
    }
    setBatchProgress(null)
    await refresh()
    if (failed === 0) toast.success(`${done} concept${done > 1 ? 's' : ''} extracted`)
    else toast(`${done} extracted, ${failed} failed`, { icon: '⚠️' })
  }

  async function handleBulkDelete() {
    const ids = [...selected]
    if (!ids.length) return
    setDeleting(true)
    let done = 0, failed = 0
    for (const id of ids) {
      try { await deleteInspiration(id); done++ }
      catch (e) { console.error('Delete failed for', id, e); failed++ }
    }
    setDeleting(false)
    setConfirmDelete(false)
    setSelected(new Set())
    setSelectMode(false)
    await refresh()
    if (failed === 0) toast.success(`${done} inspiration${done > 1 ? 's' : ''} deleted`)
    else toast(`${done} deleted, ${failed} failed`, { icon: '⚠️' })
  }

  if (ctxLoading) return null
  if (!businesses?.length) return <NeedBusiness />
  if (!businessId) return <PickBusiness />

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-noch-card border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm"
          >
            <option value="">All statuses</option>
            {INSPIRATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* View mode */}
          <div className="flex items-center bg-noch-card border border-noch-border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'}`}
            >
              <List size={14} />
            </button>
          </div>

          {items.length > 0 && (
            <button
              onClick={() => setSelectMode(m => !m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                selectMode ? 'bg-noch-green text-noch-dark border-noch-green' : 'bg-noch-card border-noch-border text-noch-muted hover:text-white'
              }`}
            >
              {selectMode ? <><X size={14} /> Exit select</> : <><CheckSquare size={14} /> Select</>}
            </button>
          )}

          {selectMode && (
            <>
              <button
                onClick={allSelected ? clearSelection : selectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-noch-card border border-noch-border text-noch-muted hover:text-white text-sm"
              >
                {allSelected ? <><Square size={14} /> Clear all</> : <><CheckSquare size={14} /> Select all</>}
              </button>
              <span className="text-noch-muted text-xs">{selected.size} selected</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectMode && selected.size > 0 && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/60 text-red-400 hover:bg-red-500/10 font-medium text-sm"
            >
              <Trash2 size={14} /> Delete {selected.size}
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={handleBatchExtract}
              disabled={!!batchProgress}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-noch-green text-noch-green font-medium text-sm disabled:opacity-60"
            >
              {batchProgress ? (
                <><Loader2 size={14} className="animate-spin" /> Extracting {batchProgress.done}/{batchProgress.total}…</>
              ) : (
                <><Sparkles size={14} /> {selectMode && selected.size > 0 ? `Extract ${selected.size}` : 'Extract all concepts'}</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm"
          >
            <Plus size={14} /> Add inspiration
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No inspiration yet"
          description="Add references via URL, screenshot, pasted text, or a quick note."
          ctaLabel="Add your first inspiration"
          onCta={() => setShowAdd(true)}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(it => (
            <InspirationCard
              key={it.id}
              item={it}
              selectable={selectMode}
              selected={selected.has(it.id)}
              onToggle={toggle}
            />
          ))}
        </div>
      ) : (
        <InspirationListView
          items={items}
          selectable={selectMode}
          selected={selected}
          onToggle={toggle}
        />
      )}

      {showAdd && (
        <AddInspirationModal
          businessId={businessId}
          onClose={() => setShowAdd(false)}
          onCreated={refresh}
        />
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          count={selected.size}
          deleting={deleting}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {confirmOverwrite && (
        <OverwriteConfirmModal
          alreadyCount={confirmOverwrite.alreadyExtracted.length}
          freshCount={confirmOverwrite.fresh.length}
          onConfirm={() => handleBatchExtract(true)}
          onSkip={() => {
            setConfirmOverwrite(null)
            if (confirmOverwrite.fresh.length) handleBatchExtract(false)
          }}
          onCancel={() => setConfirmOverwrite(null)}
        />
      )}
    </div>
  )
}

function OverwriteConfirmModal({ alreadyCount, freshCount, onConfirm, onSkip, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-noch-card border border-noch-border rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-base mb-1">Re-extract already-extracted items?</h3>
            <p className="text-noch-muted text-sm">
              {alreadyCount} selected item{alreadyCount > 1 ? 's have' : ' has'} an existing saved concept.
              Re-extracting will <span className="text-white font-medium">overwrite</span> the saved concept in the bank, including any manual edits.
              {freshCount > 0 && ` ${freshCount} un-extracted item${freshCount > 1 ? 's' : ''} will also be processed.`}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onConfirm} className="btn-primary w-full">
            Overwrite & extract ({alreadyCount + freshCount})
          </button>
          {freshCount > 0 && (
            <button onClick={onSkip} className="btn-secondary w-full">
              Skip extracted, only process {freshCount} new
            </button>
          )}
          <button onClick={onCancel} className="text-noch-muted text-sm py-2 hover:text-white">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function InspirationListView({ items, selectable, selected, onToggle }) {
  return (
    <div className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden">
      <div className="divide-y divide-noch-border">
        {items.map(it => (
          <InspirationRow
            key={it.id}
            item={it}
            selectable={selectable}
            selected={selected.has(it.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

function InspirationRow({ item, selectable, selected, onToggle }) {
  const handleClick = (e) => {
    if (selectable) {
      e.preventDefault()
      onToggle?.(item.id)
    }
  }
  const preview = item.preview_image_url
  const title = item.title || (item.source_url ? safeHost(item.source_url) : 'Untitled')
  const blurb = item.source_text || item.source_url || ''

  const content = (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-noch-card-hover transition-colors ${selected ? 'bg-noch-green/5' : ''}`}>
      {selectable && (
        <div
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
            selected ? 'bg-noch-green border-noch-green' : 'border-white/40'
          }`}
        >
          {selected && <span className="w-2 h-2 bg-noch-dark rounded-sm" />}
        </div>
      )}
      {preview ? (
        <img src={preview} alt="" className="w-12 h-12 rounded-lg object-cover border border-noch-border flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-noch-dark border border-noch-border flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">{title}</p>
        {blurb && <p className="text-noch-muted text-xs truncate">{blurb}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {item.platform && <span className="text-noch-muted text-xs hidden md:inline">{item.platform}</span>}
        <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-noch-border text-noch-muted">
          {item.status}
        </span>
      </div>
    </div>
  )

  if (selectable) {
    return <div className="cursor-pointer" onClick={handleClick}>{content}</div>
  }
  return <Link to={`/content-studio/inspiration/${item.id}`}>{content}</Link>
}

function DeleteConfirmModal({ count, deleting, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={deleting ? null : onCancel}>
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Delete {count} inspiration{count > 1 ? 's' : ''}?</h3>
              <p className="text-noch-muted text-sm mt-1">
                This will permanently delete {count > 1 ? 'these inspirations' : 'this inspiration'} and any linked extracted concepts and drafts.
                This action cannot be undone.
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-noch-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-noch-muted hover:text-white text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white font-medium text-sm disabled:opacity-50"
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}
            {deleting ? 'Deleting…' : `Delete ${count}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function safeHost(url) {
  try { return new URL(url).hostname } catch { return url }
}

function NeedBusiness() {
  return (
    <EmptyState
      icon={Lightbulb}
      title="Create a business first"
      description="Inspiration is scoped to a business. Create one to get started."
      ctaLabel="Add a business"
      ctaTo="/content-studio/businesses/new"
    />
  )
}

function PickBusiness() {
  return (
    <EmptyState
      icon={Lightbulb}
      title="Pick a business"
      description="Select a business from the top of the page to view its inspiration."
    />
  )
}
