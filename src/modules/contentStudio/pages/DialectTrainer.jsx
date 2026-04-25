import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Languages, Loader2, FilePlus2, FolderOpen, X, Link2,
  Image as ImageIcon, ClipboardPaste, CheckCircle2, Sparkles,
  ChevronDown, ChevronRight, Merge, BookOpen,
} from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../components/EmptyState'
import { listVoiceProfiles } from '../services/voiceProfiles'
import { mergeDialectTraining } from '../services/voiceProfiles'
import { trainDialect, createTrainingItem, updateTrainingItem, fileToBase64, scrapeWattpad } from '../services/dialectTraining'
import { usePageState } from '../../../lib/usePageState'

const TABS = [
  { id: 'screenshot', label: 'Screenshots', icon: ImageIcon },
  { id: 'url',        label: 'URL',         icon: Link2 },
  { id: 'pasted_text',label: 'Paste text',  icon: ClipboardPaste },
  { id: 'wattpad',    label: 'Wattpad',     icon: BookOpen },
]

export default function DialectTrainer() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [voices, setVoices] = useState([])
  const [activeVoiceId, setActiveVoiceId] = useState('')
  const [loadingVoices, setLoadingVoices] = useState(false)

  const [tab, setTab] = usePageState('dialect-trainer:tab', 'screenshot')
  const [files, setFiles] = usePageState('dialect-trainer:files', [])
  const [urlInput, setUrlInput] = usePageState('dialect-trainer:urlInput', '')
  const [pasteText, setPasteText] = usePageState('dialect-trainer:pasteText', '')

  const [results, setResults] = usePageState('dialect-trainer:results', []) // { id, source_label, item, result, status, merging, expanded }
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // Wattpad tab
  const [wattpadUrl, setWattpadUrl] = usePageState('dialect-trainer:wattpadUrl', '')
  const [wattpadMaxChapters, setWattpadMaxChapters] = usePageState('dialect-trainer:wattpadMaxChapters', 10)
  const [wattpadScraped, setWattpadScraped] = usePageState('dialect-trainer:wattpadScraped', null)
  const [wattpadSelected, setWattpadSelected] = usePageState('dialect-trainer:wattpadSelected', [])
  const [wattpadPhase, setWattpadPhase] = useState('idle') // 'idle' | 'scraping' | 'extracting'

  const filesInputRef = useRef(null)
  const folderInputRef = useRef(null)

  const loadVoices = useCallback(async () => {
    if (!businessId) { setVoices([]); return }
    setLoadingVoices(true)
    try {
      const vs = await listVoiceProfiles(businessId)
      setVoices(vs)
      if (!activeVoiceId && vs.length > 0) setActiveVoiceId(vs[0].id)
    } catch (e) { console.error(e) }
    finally { setLoadingVoices(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  useEffect(() => { loadVoices() }, [loadVoices])

  const activeVoice = voices.find(v => v.id === activeVoiceId) || voices[0]

  // --- File helpers (same pattern as AddInspirationModal) ---
  function addFiles(incoming) {
    const imgs = Array.from(incoming || []).filter(f => f.type?.startsWith('image/'))
    if (!imgs.length) return toast.error('No image files found')
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}-${f.size}`))
      const merged = [...prev]
      for (const f of imgs) {
        const key = `${f.name}-${f.size}`
        if (!seen.has(key)) { merged.push(f); seen.add(key) }
      }
      return merged
    })
  }

  // --- Extract ---
  async function handleExtract() {
    if (!activeVoice) return toast.error('Select a voice profile first')

    let items = []
    if (tab === 'screenshot') {
      if (!files.length) return toast.error('Add at least one screenshot')
      items = files.map(f => ({ source_type: 'screenshot', file: f, label: f.name }))
    } else if (tab === 'url') {
      if (!urlInput.trim()) return toast.error('Enter a URL')
      items = [{ source_type: 'url', raw_url: urlInput.trim(), label: urlInput.trim() }]
    } else {
      if (!pasteText.trim()) return toast.error('Paste some text first')
      items = [{ source_type: 'pasted_text', raw_text: pasteText.trim(), label: 'Pasted text' }]
    }

    setExtracting(true)
    setProgress({ done: 0, total: items.length })

    for (let i = 0; i < items.length; i++) {
      const src = items[i]
      const tempId = `temp-${Date.now()}-${i}`
      // Add pending card immediately so user sees progress
      setResults(prev => [...prev, {
        id: tempId, source_label: src.label, status: 'extracting', expanded: true,
        result: null, dbId: null,
      }])

      try {
        const itemPayload = { source_type: src.source_type }
        if (src.raw_url) itemPayload.raw_url = src.raw_url
        if (src.raw_text) itemPayload.raw_text = src.raw_text
        if (src.file) {
          const base64 = await fileToBase64(src.file)
          itemPayload.image = { base64, mimeType: src.file.type }
        }

        const extracted = await trainDialect({ item: itemPayload, voiceProfile: activeVoice })

        // Write to DB for audit trail
        let dbRow = null
        try {
          dbRow = await createTrainingItem({
            business_id: businessId,
            voice_profile_id: activeVoice.id,
            source_type: src.source_type,
            raw_url: src.raw_url || null,
            raw_text: src.raw_text || null,
            extracted_lexicon: extracted.extracted_lexicon || [],
            extracted_gold: extracted.extracted_gold || [],
            extracted_forbidden: extracted.extracted_forbidden || [],
            extraction_notes: extracted.extraction_notes || null,
            status: 'extracted',
          })
        } catch (dbErr) {
          console.warn('DB write failed (non-fatal):', dbErr)
        }

        setResults(prev => prev.map(r =>
          r.id === tempId
            ? { ...r, id: dbRow?.id || tempId, dbId: dbRow?.id, status: 'extracted', result: extracted, expanded: true }
            : r
        ))
      } catch (e) {
        setResults(prev => prev.map(r =>
          r.id === tempId
            ? { ...r, status: 'failed', result: { extraction_notes: e.message || 'Extraction failed' } }
            : r
        ))
      }

      setProgress({ done: i + 1, total: items.length })
    }

    setExtracting(false)
    // Clear inputs after extract
    if (tab === 'screenshot') setFiles([])
    if (tab === 'url') setUrlInput('')
    if (tab === 'pasted_text') setPasteText('')
  }

  // --- Wattpad scrape ---
  async function handleWattpadScrape() {
    if (!wattpadUrl.trim()) return toast.error('Paste a Wattpad story URL')
    if (!activeVoice) return toast.error('Select a voice profile first')
    setWattpadPhase('scraping')
    setWattpadScraped(null)
    try {
      const res = await scrapeWattpad({ storyUrl: wattpadUrl.trim(), maxChapters: wattpadMaxChapters })
      setWattpadScraped(res)
      const usable = (res.chapters || []).filter(c => !c.skipped && c.text)
      toast.success(`Scraped ${usable.length} chapter${usable.length === 1 ? '' : 's'} · ${res.totalChars.toLocaleString()} chars`)
    } catch (e) {
      toast.error(e.message || 'Scrape failed')
    } finally {
      setWattpadPhase('idle')
    }
  }

  async function handleWattpadExtractAll() {
    if (!wattpadScraped || !activeVoice) return
    const selectedSet = new Set(wattpadSelected)
    const usable = (wattpadScraped.chapters || [])
      .map((c, i) => ({ ...c, _idx: i }))
      .filter(c => !c.skipped && c.text && (selectedSet.size === 0 || selectedSet.has(c._idx)))
    if (!usable.length) return toast.error('Select at least one chapter')

    setWattpadPhase('extracting')
    setExtracting(true)
    setProgress({ done: 0, total: usable.length })

    // Seed placeholder rows so the UI shows all chapters immediately
    const tempIds = usable.map((ch, i) => `wp-${Date.now()}-${i}`)
    setResults(prev => [
      ...prev,
      ...usable.map((ch, i) => ({
        id: tempIds[i],
        source_label: `${wattpadScraped.storyTitle} — ${ch.title}`,
        status: 'extracting',
        expanded: false,
        result: null,
        dbId: null,
      })),
    ])

    let done = 0
    const CONCURRENCY = 2
    const semaphore = Array.from({ length: CONCURRENCY }, () => Promise.resolve())
    let slotIdx = 0

    const tasks = usable.map((ch, i) => {
      const slot = slotIdx % CONCURRENCY
      slotIdx++
      const label = `${wattpadScraped.storyTitle} — ${ch.title}`
      const tempId = tempIds[i]

      semaphore[slot] = semaphore[slot].then(async () => {
        try {
          const extracted = await trainDialect({
            item: { source_type: 'pasted_text', raw_text: ch.text },
            voiceProfile: activeVoice,
          })
          let dbRow = null
          try {
            dbRow = await createTrainingItem({
              business_id: businessId,
              voice_profile_id: activeVoice.id,
              source_type: 'pasted_text',
              raw_url: ch.url,
              raw_text: ch.text,
              extracted_lexicon: extracted.extracted_lexicon || [],
              extracted_gold: extracted.extracted_gold || [],
              extracted_forbidden: extracted.extracted_forbidden || [],
              extraction_notes: `Wattpad: ${label}. ${extracted.extraction_notes || ''}`.trim(),
              status: 'extracted',
            })
          } catch (dbErr) { console.warn('DB write failed:', dbErr) }

          setResults(prev => prev.map(r =>
            r.id === tempId
              ? { ...r, id: dbRow?.id || tempId, dbId: dbRow?.id, status: 'extracted', result: extracted }
              : r
          ))
        } catch (e) {
          setResults(prev => prev.map(r =>
            r.id === tempId
              ? { ...r, status: 'failed', result: { extraction_notes: e.message || 'Extraction failed' } }
              : r
          ))
        }
        done++
        setProgress({ done, total: usable.length })
      })

      return semaphore[slot]
    })

    await Promise.all(tasks)
    setExtracting(false)
    setWattpadPhase('idle')
  }

  // --- Merge single item ---
  async function handleMerge(resultId) {
    if (!activeVoice) return
    setResults(prev => prev.map(r => r.id === resultId ? { ...r, merging: true } : r))
    try {
      const item = results.find(r => r.id === resultId)
      await mergeDialectTraining(activeVoice.id, item.result)
      // Reload the voice profile so counts are fresh
      const updated = await listVoiceProfiles(businessId)
      setVoices(updated)
      // Mark merged in DB
      if (item.dbId) {
        updateTrainingItem(item.dbId, { status: 'merged', merged_at: new Date().toISOString() }).catch(() => {})
      }
      setResults(prev => prev.map(r => r.id === resultId ? { ...r, status: 'merged', merging: false } : r))
      toast.success('Merged into voice profile')
    } catch (e) {
      setResults(prev => prev.map(r => r.id === resultId ? { ...r, merging: false } : r))
      toast.error(e.message || 'Merge failed')
    }
  }

  // --- Merge all pending ---
  async function handleMergeAll() {
    const pending = results.filter(r => r.status === 'extracted')
    if (!pending.length) return
    for (const r of pending) {
      await handleMerge(r.id)
    }
  }

  const pendingCount = results.filter(r => r.status === 'extracted').length

  if (ctxLoading) return null
  if (!businesses?.length) {
    return <EmptyState icon={Languages} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  }
  if (!businessId) {
    return <EmptyState icon={Languages} title="Pick a business" description="Select one from the top of the page." />
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg">Dialect Trainer</h2>
          <p className="text-noch-muted text-sm mt-0.5">
            Upload Facebook screenshots, paste URLs, or drop in text to extract Tripoli Libyan vocabulary and examples.
          </p>
        </div>
      </div>

      {/* Voice profile selector */}
      <div className="bg-noch-card border border-noch-border rounded-xl px-4 py-3 flex items-center gap-3">
        <Languages size={16} className="text-noch-green shrink-0" />
        <span className="text-noch-muted text-sm shrink-0">Training profile:</span>
        {loadingVoices ? (
          <Loader2 size={14} className="animate-spin text-noch-muted" />
        ) : voices.length === 0 ? (
          <span className="text-noch-muted text-sm italic">No voice profiles — create one in Voice Lab first</span>
        ) : (
          <select
            value={activeVoiceId}
            onChange={e => setActiveVoiceId(e.target.value)}
            className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-noch-green"
          >
            {voices.map(v => (
              <option key={v.id} value={v.id}>{v.name}{v.is_default ? ' (default)' : ''}</option>
            ))}
          </select>
        )}
        {activeVoice && (
          <span className="text-noch-muted text-xs shrink-0">
            {activeVoice.dialect_lexicon?.length || 0} lexicon · {activeVoice.gold_examples?.length || 0} gold · {activeVoice.forbidden_msa_forms?.length || 0} forbidden
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex gap-1 p-3 border-b border-noch-border bg-noch-dark/30">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tab === t.id ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        <div className="p-4 space-y-3">
          {/* Screenshot tab */}
          {tab === 'screenshot' && (
            <>
              <input ref={filesInputRef} type="file" accept="image/*" multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} className="hidden" />
              <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} className="hidden" />
              <div className="flex gap-2">
                <button type="button" onClick={() => filesInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-noch-dark border border-noch-border hover:border-noch-green/60 rounded-lg px-3 py-2.5 text-white text-sm transition-colors">
                  <FilePlus2 size={14} /> Add files
                </button>
                <button type="button" onClick={() => folderInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-noch-dark border border-noch-border hover:border-noch-green/60 rounded-lg px-3 py-2.5 text-white text-sm transition-colors">
                  <FolderOpen size={14} /> Scan folder
                </button>
              </div>
              {files.length > 0 && (
                <ul className="max-h-40 overflow-y-auto border border-noch-border rounded-lg divide-y divide-noch-border">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="text-white truncate pr-2">{f.webkitRelativePath || f.name}</span>
                      <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-noch-muted hover:text-red-400"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-noch-muted text-xs">{files.length} image{files.length > 1 ? 's' : ''} ready</span>
                  <button type="button" onClick={() => setFiles([])} className="text-noch-muted hover:text-white text-xs">Clear all</button>
                </div>
              )}
            </>
          )}

          {/* URL tab */}
          {tab === 'url' && (
            <div className="space-y-2">
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://www.facebook.com/... or any blog/website URL"
                className={inputCls}
                onKeyDown={e => { if (e.key === 'Enter') handleExtract() }}
              />
              <p className="text-noch-muted text-xs">
                Facebook posts: the app fetches the post preview text automatically.
                If the URL returns nothing, switch to Paste text and copy the post manually.
              </p>
            </div>
          )}

          {/* Paste tab */}
          {tab === 'pasted_text' && (
            <textarea
              rows={5}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste a Libyan Facebook post, comment thread, blog excerpt, or any Tripoli dialect text…"
              className={inputCls}
              dir="auto"
            />
          )}

          {/* Wattpad tab */}
          {tab === 'wattpad' && (
            <div className="space-y-3">
              <div>
                <label className="text-noch-muted text-xs block mb-1">Wattpad story URL</label>
                <input
                  type="url"
                  value={wattpadUrl}
                  onChange={e => setWattpadUrl(e.target.value)}
                  placeholder="https://www.wattpad.com/story/123456789-title"
                  className={inputCls}
                  onKeyDown={e => { if (e.key === 'Enter' && wattpadPhase === 'idle') handleWattpadScrape() }}
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-noch-muted text-xs shrink-0">Max chapters:</label>
                <input
                  type="range"
                  min={1} max={100} step={1}
                  value={wattpadMaxChapters}
                  onChange={e => setWattpadMaxChapters(parseInt(e.target.value, 10))}
                  className="flex-1 accent-noch-green"
                />
                <span className="text-white text-xs font-medium w-10 text-right">{wattpadMaxChapters}</span>
              </div>

              <p className="text-noch-muted text-xs">
                Scraping is free (no tokens). Extraction costs ~$0.02 per chapter.
                Test with a small chapter count first to verify the story scrapes cleanly.
              </p>

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={handleWattpadScrape}
                  disabled={wattpadPhase !== 'idle' || !wattpadUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-noch-dark border border-noch-border hover:border-noch-green/60 text-white font-medium text-sm disabled:opacity-50"
                >
                  {wattpadPhase === 'scraping'
                    ? <><Loader2 size={14} className="animate-spin" /> Scraping…</>
                    : <><BookOpen size={14} /> Scrape preview</>
                  }
                </button>
                {wattpadScraped && (wattpadScraped.chapters || []).some(c => !c.skipped) && (() => {
                  const usableCount = (wattpadScraped.chapters || []).filter(c => !c.skipped).length
                  const selCount = wattpadSelected.length
                  const count = selCount || usableCount
                  return (
                    <button
                      onClick={handleWattpadExtractAll}
                      disabled={wattpadPhase !== 'idle' || extracting}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
                    >
                      {wattpadPhase === 'extracting'
                        ? <><Loader2 size={14} className="animate-spin" /> Extracting {progress.done}/{progress.total}…</>
                        : <><Sparkles size={14} /> Extract {selCount ? `${selCount} selected` : `all ${usableCount}`}</>
                      }
                    </button>
                  )
                })()}
              </div>

              {wattpadScraped && (
                <div className="bg-noch-dark border border-noch-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium truncate">{wattpadScraped.storyTitle}</p>
                      {wattpadScraped.author && (
                        <p className="text-noch-muted text-xs">by {wattpadScraped.author}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-noch-green text-xs font-medium">
                        {wattpadScraped.chaptersFetched} / {wattpadScraped.chaptersFound} chapters
                      </p>
                      <p className="text-noch-muted text-xs">{wattpadScraped.totalChars.toLocaleString()} chars</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const all = (wattpadScraped.chapters || [])
                          .map((c, i) => !c.skipped ? i : -1)
                          .filter(i => i >= 0)
                        setWattpadSelected(all)
                      }}
                      className="px-2 py-0.5 rounded border border-noch-border text-noch-muted hover:text-white"
                    >Select all</button>
                    <button
                      type="button"
                      onClick={() => setWattpadSelected([])}
                      className="px-2 py-0.5 rounded border border-noch-border text-noch-muted hover:text-white"
                    >Clear</button>
                    <span className="text-noch-muted">
                      {wattpadSelected.length
                        ? `${wattpadSelected.length} selected`
                        : 'None selected — will extract all'}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-noch-border rounded divide-y divide-noch-border">
                    {(wattpadScraped.chapters || []).map((ch, i) => {
                      const isSelected = wattpadSelected.includes(i)
                      const willTruncate = !ch.skipped && ch.chars > 5000
                      const toggle = () => {
                        if (ch.skipped) return
                        setWattpadSelected(prev => isSelected ? prev.filter(x => x !== i) : [...prev, i])
                      }
                      return (
                        <label
                          key={i}
                          onClick={ch.skipped ? undefined : toggle}
                          className={`flex items-center gap-2 px-2 py-1 text-xs ${ch.skipped ? '' : 'cursor-pointer hover:bg-noch-dark/40'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={ch.skipped}
                            onChange={toggle}
                            onClick={e => e.stopPropagation()}
                            className="accent-noch-green shrink-0"
                          />
                          <span className={`truncate pr-2 flex-1 ${ch.skipped ? 'text-noch-muted italic' : 'text-white'}`}>
                            {ch.title}
                          </span>
                          {willTruncate && (
                            <span
                              className="text-amber-400 shrink-0"
                              title="Chapter is longer than 5,000 chars. Only the first 5,000 chars will be sent to Claude (to stay under the 150s edge-function timeout). Dialect patterns repeat — you lose little signal."
                            >truncated</span>
                          )}
                          <span className="text-noch-muted shrink-0">
                            {ch.skipped ? 'skipped' : `${ch.chars.toLocaleString()} chars`}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extract button (not on Wattpad tab — it has its own flow) */}
          {tab !== 'wattpad' && (
            <div className="flex justify-end">
              <button
                onClick={handleExtract}
                disabled={extracting || !activeVoice}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
              >
                {extracting
                  ? <><Loader2 size={14} className="animate-spin" /> {progress.total > 1 ? `Extracting ${progress.done}/${progress.total}…` : 'Extracting…'}</>
                  : <><Sparkles size={14} /> {tab === 'screenshot' && files.length > 1 ? `Extract ${files.length} screenshots` : 'Extract'}</>
                }
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium text-sm">{results.length} item{results.length > 1 ? 's' : ''} extracted</h3>
            {pendingCount > 1 && (
              <button
                onClick={handleMergeAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-noch-green/10 border border-noch-green/30 text-noch-green text-xs font-medium hover:bg-noch-green/20"
              >
                <Merge size={12} /> Merge all {pendingCount} into profile
              </button>
            )}
          </div>

          {results.map(r => (
            <TrainingResultCard
              key={r.id}
              item={r}
              onMerge={() => handleMerge(r.id)}
              onDiscard={() => setResults(prev => prev.filter(x => x.id !== r.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TrainingResultCard({ item, onMerge, onDiscard }) {
  const [open, setOpen] = useState(item.status === 'extracted')
  const res = item.result

  const lexCount  = res?.extracted_lexicon?.length  || 0
  const goldCount = res?.extracted_gold?.length     || 0
  const forbCount = res?.extracted_forbidden?.length || 0
  const hasData   = lexCount + goldCount + forbCount > 0

  return (
    <div className={`bg-noch-card border rounded-xl overflow-hidden ${
      item.status === 'merged'    ? 'border-noch-green/30 opacity-70' :
      item.status === 'failed'    ? 'border-red-500/30' :
      item.status === 'extracting'? 'border-noch-border animate-pulse' :
                                    'border-noch-border'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen(o => !o)} className="text-noch-muted">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-white text-sm font-medium flex-1 truncate">{item.source_label}</span>

        {/* Status / counts */}
        {item.status === 'extracting' && <Loader2 size={14} className="animate-spin text-noch-muted" />}
        {item.status === 'extracted' && hasData && (
          <span className="text-noch-muted text-xs">{lexCount} lex · {goldCount} gold · {forbCount} forbidden</span>
        )}
        {item.status === 'extracted' && !hasData && (
          <span className="text-noch-muted text-xs italic">Nothing new found</span>
        )}
        {item.status === 'merged' && (
          <span className="flex items-center gap-1 text-noch-green text-xs"><CheckCircle2 size={12} /> Merged</span>
        )}
        {item.status === 'failed' && (
          <span
            className="text-red-400 text-xs truncate max-w-[260px]"
            title={res?.extraction_notes || 'Failed'}
          >
            Failed: {res?.extraction_notes || 'unknown error'}
          </span>
        )}

        {/* Actions */}
        {item.status === 'extracted' && hasData && (
          <button
            onClick={onMerge}
            disabled={item.merging}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-noch-green/10 text-noch-green text-xs font-medium hover:bg-noch-green/20 disabled:opacity-50"
          >
            {item.merging ? <Loader2 size={11} className="animate-spin" /> : <Merge size={11} />}
            Merge
          </button>
        )}
        {item.status !== 'extracting' && (
          <button type="button" onClick={onDiscard} className="text-noch-muted hover:text-red-400 ml-1">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {open && res && (
        <div className="px-4 pb-4 space-y-3 border-t border-noch-border pt-3">
          {res.extraction_notes && (
            <p className="text-noch-muted text-xs italic">{res.extraction_notes}</p>
          )}

          {lexCount > 0 && (
            <div>
              <span className="text-noch-muted text-[10px] uppercase tracking-wide block mb-1.5">Lexicon ({lexCount})</span>
              <div className="space-y-1">
                {res.extracted_lexicon.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-noch-muted">{e.msa || '—'}</span>
                    <span className="text-noch-muted">→</span>
                    <span className="text-white font-medium" dir="rtl">{e.dialect}</span>
                    {e.note && <span className="text-noch-muted italic truncate">({e.note})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {goldCount > 0 && (
            <div>
              <span className="text-noch-muted text-[10px] uppercase tracking-wide block mb-1.5">Gold examples ({goldCount})</span>
              <div className="space-y-1">
                {res.extracted_gold.map((e, i) => (
                  <p key={i} className="text-white text-xs bg-noch-dark/40 border border-noch-border rounded-lg px-3 py-2" dir="auto">
                    {e.text}
                  </p>
                ))}
              </div>
            </div>
          )}

          {forbCount > 0 && (
            <div>
              <span className="text-noch-muted text-[10px] uppercase tracking-wide block mb-1.5">Forbidden forms ({forbCount})</span>
              <div className="flex flex-wrap gap-1">
                {res.extracted_forbidden.map(w => (
                  <span key={w} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{w}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/60 focus:outline-none focus:border-noch-green'
