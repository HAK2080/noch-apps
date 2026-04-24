import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { BookOpen, Plus, Search, ExternalLink, Trash2, Star, RefreshCw, Zap, X, Sparkles, Eye, Radar, Globe, ToggleLeft, ToggleRight, CheckSquare, Link } from 'lucide-react'
import { getContentResearch, createResearch, updateResearch, getBrand, autoResearch, getSwipeFile, createSwipeEntries, updateSwipeEntry, webScout, getScoutSources, createScoutSource, updateScoutSource, deleteScoutSource, scrapeSources, discoverSources } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

const SOURCE_TYPES = [
  { value: 'all',      label: 'All' },
  { value: 'trend',    label: 'Trend' },
  { value: 'manual',   label: 'Manual Note' },
  { value: 'url',      label: 'URL / Link' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'competitor', label: 'Competitor' },
]

const STATUS_OPTIONS = [
  { value: 'new',      label: 'New',     color: 'text-blue-400' },
  { value: 'promising',label: 'Promising',color: 'text-yellow-400' },
  { value: 'used',     label: 'Used',    color: 'text-noch-muted' },
]

function SwipeCard({ item, onCurate, onUse }) {
  const platformColors = {
    instagram: 'text-pink-400', twitter: 'text-blue-400', tiktok: 'text-cyan-400',
    website: 'text-noch-muted', blog: 'text-orange-400',
  }
  const scoreColor = item.voice_similarity_score >= 8 ? 'text-noch-green' :
    item.voice_similarity_score >= 6 ? 'text-yellow-400' : 'text-noch-muted'

  return (
    <div className={`bg-noch-card border rounded-xl p-4 transition-colors ${item.is_curated ? 'border-noch-green/40' : 'border-noch-border hover:border-noch-green/20'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium capitalize ${platformColors[item.source_platform] || 'text-noch-muted'}`}>
            {item.source_platform || 'web'}
          </span>
          {item.author_handle && (
            <span className="text-xs text-noch-muted">{item.author_handle}</span>
          )}
          {item.caption_language && item.caption_language !== 'en' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-noch-border/50 text-noch-muted uppercase">{item.caption_language}</span>
          )}
        </div>
        <div className={`flex items-center gap-1 ${scoreColor} shrink-0`}>
          <Sparkles size={12} />
          <span className="text-xs font-bold">{item.voice_similarity_score}/10</span>
        </div>
      </div>

      <p className="text-white text-sm leading-relaxed mb-3 whitespace-pre-line line-clamp-4">
        {item.caption_text}
      </p>

      {item.why_relevant && (
        <p className="text-noch-muted text-xs mb-2 italic">"{item.why_relevant}"</p>
      )}

      {item.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {item.hashtags.slice(0, 6).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-noch-border/50 text-blue-300">#{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-noch-border/30">
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-noch-muted hover:text-white transition-colors">
            <ExternalLink size={11} /> Source
          </a>
        )}
        <button
          onClick={() => onCurate(item)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
            item.is_curated
              ? 'bg-noch-green/20 text-noch-green border border-noch-green/30'
              : 'text-noch-muted border border-noch-border hover:border-noch-green/30 hover:text-noch-green'
          }`}
        >
          <Star size={11} fill={item.is_curated ? 'currentColor' : 'none'} />
          {item.is_curated ? 'Curated' : 'Curate'}
        </button>
        <button
          onClick={() => onUse(item)}
          className="ms-auto text-xs text-noch-green border border-noch-green/30 px-2 py-1 rounded-lg hover:bg-noch-green/10 transition-colors"
        >
          Use as inspiration →
        </button>
      </div>
    </div>
  )
}

function ResearchCard({ item, onUse, onDelete, onStatus }) {
  const statusCfg = STATUS_OPTIONS.find(s => s.value === item.status) || STATUS_OPTIONS[0]
  return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-4 hover:border-noch-green/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-noch-border/50 text-noch-muted font-medium capitalize">
              {item.source_type}
            </span>
            {item.source_platform && (
              <span className="text-xs text-noch-muted">{item.source_platform}</span>
            )}
            <span className={`text-xs font-semibold ms-auto ${statusCfg.color}`}>{statusCfg.label}</span>
          </div>
          <h3 className="text-white font-semibold text-sm">{item.source_title || 'Untitled research'}</h3>
        </div>
        {item.relevance_score > 0 && (
          <div className="flex items-center gap-1 text-yellow-400 shrink-0">
            <Star size={12} fill="currentColor" />
            <span className="text-xs font-bold">{item.relevance_score}</span>
          </div>
        )}
      </div>

      {item.raw_content && (
        <p className="text-noch-muted text-xs line-clamp-2 mb-2">{item.raw_content}</p>
      )}

      {item.insight && (
        <div className="bg-noch-green/5 border border-noch-green/20 rounded-lg p-2 mb-3">
          <p className="text-noch-green text-xs">💡 {item.insight}</p>
        </div>
      )}

      {item.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-noch-border/50 text-noch-muted">#{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-noch-border/30">
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-noch-muted hover:text-white transition-colors">
            <ExternalLink size={11} /> Source
          </a>
        )}
        <button
          onClick={() => onUse(item)}
          className="ms-auto text-xs text-noch-green border border-noch-green/30 px-2 py-1 rounded-lg hover:bg-noch-green/10 transition-colors"
        >
          Use in post →
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="text-noch-muted hover:text-red-400 transition-colors p-1"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function AddResearchModal({ brandId, onSave, onClose }) {
  const [form, setForm] = useState({
    source_type: 'manual',
    source_title: '',
    source_url: '',
    source_platform: '',
    raw_content: '',
    insight: '',
    tags: '',
    relevance_score: 7,
    status: 'new',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.source_title && !form.raw_content) {
      toast.error('Add a title or content')
      return
    }
    setSaving(true)
    try {
      await onSave({
        ...form,
        brand_id: brandId,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        relevance_score: Number(form.relevance_score),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-lg p-6">
        <h3 className="text-white font-bold text-lg mb-5">Add Research</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Type</label>
              <select
                value={form.source_type}
                onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))}
                className="input w-full"
              >
                {SOURCE_TYPES.slice(1).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Platform</label>
              <input
                value={form.source_platform}
                onChange={e => setForm(f => ({ ...f, source_platform: e.target.value }))}
                placeholder="instagram, tiktok..."
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-noch-muted text-xs mb-1 block">Title / Headline</label>
            <input
              value={form.source_title}
              onChange={e => setForm(f => ({ ...f, source_title: e.target.value }))}
              placeholder="What's this research about?"
              className="input w-full"
            />
          </div>

          <div>
            <label className="text-noch-muted text-xs mb-1 block">URL (optional)</label>
            <input
              value={form.source_url}
              onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
              placeholder="https://..."
              className="input w-full"
            />
          </div>

          <div>
            <label className="text-noch-muted text-xs mb-1 block">Raw content / Notes</label>
            <textarea
              value={form.raw_content}
              onChange={e => setForm(f => ({ ...f, raw_content: e.target.value }))}
              placeholder="Paste content, describe what you saw..."
              className="input w-full h-20 resize-none"
            />
          </div>

          <div>
            <label className="text-noch-muted text-xs mb-1 block">Key Insight 💡</label>
            <textarea
              value={form.insight}
              onChange={e => setForm(f => ({ ...f, insight: e.target.value }))}
              placeholder="What does this mean for Noch content?"
              className="input w-full h-16 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Tags (comma-separated)</label>
              <input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="matcha, trend, gen-z"
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-noch-muted text-xs mb-1 block">Relevance (1-10)</label>
              <input
                type="number" min="1" max="10"
                value={form.relevance_score}
                onChange={e => setForm(f => ({ ...f, relevance_score: e.target.value }))}
                className="input w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-noch-border rounded-lg text-noch-muted hover:text-white transition-colors text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary">
            {saving ? 'Saving...' : 'Save Research'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ResearchHub() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isOwner } = useAuth()
  const brandId = searchParams.get('brand')

  const [brand, setBrand] = useState(null)
  const [research, setResearch] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showAutoResearch, setShowAutoResearch] = useState(false)
  const [autoMode, setAutoMode] = useState('trending') // trending | urls | topics | web-scout
  const [autoUrls, setAutoUrls] = useState('')
  // Swipe file
  const [activeTab, setActiveTab] = useState('research') // research | swipe | scout
  const [swipeFile, setSwipeFile] = useState([])
  const [swipeLoading, setSwipeLoading] = useState(false)
  const [scouting, setScouting] = useState(false)
  const [autoTopics, setAutoTopics] = useState('')
  const [autoRunning, setAutoRunning] = useState(false)
  // Scout sources
  const [scoutSources, setScoutSources] = useState([])
  const [scoutLoading, setScoutLoading] = useState(false)
  const [showAddSource, setShowAddSource] = useState(false)
  const [addSourceForm, setAddSourceForm] = useState({ url: '', name: '', platform: 'facebook', category: 'competitor', city: 'tripoli' })
  const [discoverResults, setDiscoverResults] = useState(null)
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [scrapeAllLoading, setScrapeAllLoading] = useState(false)
  const [selectedDiscover, setSelectedDiscover] = useState(new Set())

  useEffect(() => {
    if (!brandId) { navigate('/content'); return }
    Promise.all([
      getBrand(brandId).then(setBrand),
      loadResearch(),
      loadSwipeFile(),
      loadScoutSources(),
    ])
  }, [brandId])

  async function loadResearch() {
    setLoading(true)
    try {
      const data = await getContentResearch(brandId)
      setResearch(data)
    } catch { toast.error('Failed to load research') }
    finally { setLoading(false) }
  }

  async function loadSwipeFile() {
    setSwipeLoading(true)
    try {
      const data = await getSwipeFile(brandId)
      setSwipeFile(data)
    } catch { /* ignore */ }
    finally { setSwipeLoading(false) }
  }

  async function runWebScout() {
    if (!brand) return
    setScouting(true)
    try {
      toast.loading('Web Scout: searching for similar posts...', { id: 'scout' })
      const { results } = await webScout(brand)
      if (results?.length > 0) {
        const entries = results.map(r => ({
          brand_id: brandId,
          source_url: r.source_url || '',
          source_platform: r.source_platform || 'web',
          caption_text: r.caption_text || '',
          caption_language: r.caption_language || 'en',
          author_handle: r.author_handle || null,
          hashtags: r.hashtags || [],
          why_relevant: r.why_relevant || '',
          voice_similarity_score: r.voice_similarity_score || 5,
          tags: r.tags || [],
          collected_by: 'web-scout',
        }))
        await createSwipeEntries(entries)
        toast.success(`${entries.length} posts collected!`, { id: 'scout' })
        loadSwipeFile()
        setActiveTab('swipe')
      } else {
        toast.success('No matching posts found this time', { id: 'scout' })
      }
    } catch (e) {
      toast.error('Web Scout failed: ' + (e.message || 'unknown'), { id: 'scout' })
    } finally {
      setScouting(false)
    }
  }

  async function loadScoutSources() {
    setScoutLoading(true)
    try {
      const data = await getScoutSources(brandId)
      setScoutSources(data)
    } catch { /* ignore */ }
    finally { setScoutLoading(false) }
  }

  async function handleAddSource() {
    if (!addSourceForm.url) { toast.error('URL is required'); return }
    try {
      await createScoutSource({
        brand_id: brandId,
        platform: addSourceForm.platform,
        page_url: addSourceForm.url,
        page_name: addSourceForm.name || extractHandleFromUrl(addSourceForm.url),
        category: addSourceForm.category,
        city: addSourceForm.city || 'tripoli',
        is_active: true,
      })
      toast.success('Source added')
      setShowAddSource(false)
      setAddSourceForm({ url: '', name: '', platform: 'facebook', category: 'competitor', city: 'tripoli' })
      loadScoutSources()
    } catch (e) { toast.error('Failed: ' + (e.message || 'unknown')) }
  }

  function extractHandleFromUrl(url) {
    try {
      const u = new URL(url)
      return u.pathname.replace(/^\/+|\/+$/g, '').split('/')[0]
    } catch { return url }
  }

  function autoDetectPlatform(url) {
    if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook'
    if (url.includes('instagram.com')) return 'instagram'
    return 'facebook'
  }

  async function handleDeleteSource(id) {
    if (!confirm('Delete this source?')) return
    try {
      await deleteScoutSource(id)
      setScoutSources(s => s.filter(x => x.id !== id))
      toast.success('Deleted')
    } catch { toast.error('Failed to delete') }
  }

  async function handleToggleSource(source) {
    try {
      await updateScoutSource(source.id, { is_active: !source.is_active })
      setScoutSources(s => s.map(x => x.id === source.id ? { ...x, is_active: !x.is_active } : x))
    } catch { toast.error('Failed to update') }
  }

  async function handleScrapeOne(source) {
    try {
      toast.loading(`Scraping ${source.page_name || source.page_url}...`, { id: 'scrape-' + source.id })
      const result = await scrapeSources(brand, [{ id: source.id, platform: source.platform, page_url: source.page_url }], brand?.brand_program)
      if (result.posts?.length > 0) {
        const entries = result.posts.map(p => ({
          brand_id: brandId,
          source_url: p.source_url,
          source_platform: p.source_platform,
          caption_text: p.caption_text,
          caption_language: p.caption_language || 'ar',
          author_handle: p.author_handle,
          voice_similarity_score: p.voice_similarity_score || 5,
          content_category: p.content_category,
          engagement_score: p.engagement_score || 0,
          reactions: p.reactions || 0,
          comments_count: p.comments_count || 0,
          shares_count: p.shares_count || 0,
          tags: [],
          collected_by: 'social-scraper',
          scraped_from_source: source.id,
        }))
        await createSwipeEntries(entries)
        toast.success(`${entries.length} posts scraped!`, { id: 'scrape-' + source.id })
        // Update source stats
        await updateScoutSource(source.id, {
          last_scraped_at: new Date().toISOString(),
          scrape_count: (source.scrape_count || 0) + 1,
          total_posts_collected: (source.total_posts_collected || 0) + entries.length,
        })
        loadScoutSources()
      } else {
        toast.success('No posts found (page may block scraping)', { id: 'scrape-' + source.id })
      }
    } catch (e) {
      toast.error('Scrape failed: ' + (e.message || 'unknown'), { id: 'scrape-' + source.id })
    }
  }

  async function handleScrapeAll() {
    const activeSources = scoutSources.filter(s => s.is_active)
    if (activeSources.length === 0) { toast.error('No active sources'); return }
    setScrapeAllLoading(true)
    try {
      toast.loading(`Scraping ${activeSources.length} sources...`, { id: 'scrape-all' })
      const result = await scrapeSources(
        brand,
        activeSources.map(s => ({ id: s.id, platform: s.platform, page_url: s.page_url })),
        brand?.brand_program
      )
      if (result.posts?.length > 0) {
        const entries = result.posts.map(p => ({
          brand_id: brandId,
          source_url: p.source_url,
          source_platform: p.source_platform,
          caption_text: p.caption_text,
          caption_language: p.caption_language || 'ar',
          author_handle: p.author_handle,
          voice_similarity_score: p.voice_similarity_score || 5,
          content_category: p.content_category,
          engagement_score: p.engagement_score || 0,
          reactions: p.reactions || 0,
          comments_count: p.comments_count || 0,
          shares_count: p.shares_count || 0,
          tags: [],
          collected_by: 'social-scraper',
          scraped_from_source: p.scraped_from_source,
        }))
        await createSwipeEntries(entries)
        toast.success(`${entries.length} posts from ${result.scrape_stats?.pages_succeeded || '?'} pages!`, { id: 'scrape-all' })
        loadScoutSources()
      } else {
        toast.success(`Scraped ${result.scrape_stats?.pages_attempted || 0} pages, no posts found`, { id: 'scrape-all' })
      }
    } catch (e) {
      toast.error('Scrape failed: ' + (e.message || 'unknown'), { id: 'scrape-all' })
    } finally {
      setScrapeAllLoading(false)
    }
  }

  async function handleDiscover() {
    setDiscoverLoading(true)
    try {
      toast.loading('Discovering pages in Tripoli...', { id: 'discover' })
      const result = await discoverSources(brand, 'tripoli')
      if (result.discovered?.length > 0) {
        setDiscoverResults(result.discovered)
        setSelectedDiscover(new Set(result.discovered.map((_, i) => i)))
        toast.success(`Found ${result.discovered.length} pages!`, { id: 'discover' })
      } else {
        toast.success('No pages found this time', { id: 'discover' })
      }
    } catch (e) {
      toast.error('Discovery failed: ' + (e.message || 'unknown'), { id: 'discover' })
    } finally {
      setDiscoverLoading(false)
    }
  }

  async function handleAddDiscovered() {
    if (!discoverResults) return
    const toAdd = discoverResults.filter((_, i) => selectedDiscover.has(i))
    let added = 0
    for (const item of toAdd) {
      try {
        await createScoutSource({
          brand_id: brandId,
          platform: item.platform,
          page_url: item.page_url,
          page_name: item.page_name,
          category: item.category,
          city: 'tripoli',
          is_active: true,
        })
        added++
      } catch { /* skip duplicates */ }
    }
    toast.success(`${added} sources added`)
    setDiscoverResults(null)
    loadScoutSources()
  }

  async function handleCurate(item) {
    try {
      await updateSwipeEntry(item.id, { is_curated: !item.is_curated })
      setSwipeFile(sf => sf.map(s => s.id === item.id ? { ...s, is_curated: !s.is_curated } : s))
      toast.success(item.is_curated ? 'Uncurated' : 'Curated!')
    } catch { toast.error('Failed to update') }
  }

  function handleSwipeUse(item) {
    navigate(`/content/create?brand=${brandId}`)
  }

  async function handleAdd(payload) {
    await createResearch(payload)
    toast.success('Research saved')
    setShowAdd(false)
    loadResearch()
  }

  async function runAutoResearch() {
    if (!brand) return
    setAutoRunning(true)
    try {
      toast.loading('Auto-researching with Claude...', { id: 'auto' })
      const payload = {
        mode: autoMode,
        urls: autoMode === 'urls' ? autoUrls.split('\n').map(u => u.trim()).filter(Boolean) : [],
        topics: autoMode === 'topics' ? autoTopics.split(',').map(t => t.trim()).filter(Boolean) : [],
      }
      const { results } = await autoResearch(brand, payload)
      // Save each result as a research entry
      let saved = 0
      for (const r of results) {
        try {
          await createResearch({
            brand_id: brandId,
            source_type: r.source_type || 'trend',
            source_title: r.source_title,
            source_url: r.source_url || '',
            source_platform: r.source_platform || '',
            raw_content: r.raw_content || r.content_angle || '',
            insight: r.insight,
            tags: r.tags || [],
            relevance_score: r.relevance_score || 7,
            status: 'new',
          })
          saved++
        } catch {}
      }
      toast.success(`${saved} research items added!`, { id: 'auto' })
      setShowAutoResearch(false)
      loadResearch()
    } catch (e) {
      toast.error(
        e.message?.includes('ANTHROPIC_API_KEY')
          ? 'API key not set in Supabase secrets'
          : 'Auto-research failed: ' + (e.message || 'unknown'),
        { id: 'auto' }
      )
    } finally {
      setAutoRunning(false)
    }
  }

  async function handleDelete(id) {
    // soft delete via status update
    await updateResearch(id, { status: 'archived' })
    setResearch(r => r.filter(i => i.id !== id))
    toast.success('Removed')
  }

  function handleUse(item) {
    navigate(`/content/create?brand=${brandId}&research=${item.id}`)
  }

  const filtered = research.filter(r => {
    if (filter !== 'all' && r.source_type !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (r.source_title || '').toLowerCase().includes(q) ||
             (r.raw_content || '').toLowerCase().includes(q) ||
             (r.insight || '').toLowerCase().includes(q)
    }
    return true
  }).filter(r => r.status !== 'archived')
    .sort((a, b) => b.relevance_score - a.relevance_score)

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <button onClick={() => navigate('/content')} className="text-noch-muted text-xs hover:text-white mb-1 block">← Content Studio</button>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BookOpen size={20} className="text-noch-green" /> Research Hub
            </h1>
            {brand && <p className="text-noch-muted text-sm">{brand.name}</p>}
          </div>
          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAutoResearch(s => !s)}
                className="flex items-center gap-2 px-3 py-2 border border-noch-green/40 rounded-xl text-noch-green hover:bg-noch-green/10 transition-colors text-sm font-medium"
              >
                <Zap size={15} /> Auto Research
              </button>
              <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Add Manually
              </button>
            </div>
          )}
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 mb-6 bg-noch-card border border-noch-border rounded-xl p-1">
          <button
            onClick={() => setActiveTab('research')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'research' ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'
            }`}
          >
            <BookOpen size={15} /> Research
          </button>
          <button
            onClick={() => setActiveTab('swipe')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'swipe' ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'
            }`}
          >
            <Sparkles size={15} /> Swipe File
            {swipeFile.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'swipe' ? 'bg-noch-dark/30 text-noch-dark' : 'bg-noch-border text-noch-muted'}`}>
                {swipeFile.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('scout')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'scout' ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'
            }`}
          >
            <Radar size={15} /> Scout Sources
            {scoutSources.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'scout' ? 'bg-noch-dark/30 text-noch-dark' : 'bg-noch-border text-noch-muted'}`}>
                {scoutSources.length}
              </span>
            )}
          </button>
        </div>

        {/* Auto Research Panel */}
        {showAutoResearch && (
          <div className="bg-noch-card border border-noch-green/30 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-bold flex items-center gap-2"><Zap size={16} className="text-noch-green" /> Auto Research</h3>
                <p className="text-noch-muted text-xs mt-0.5">Claude scouts content and generates research insights automatically</p>
              </div>
              <button onClick={() => setShowAutoResearch(false)} className="text-noch-muted hover:text-white">
                <X size={16} />
              </button>
            </div>

            {/* Mode selector */}
            <div className="flex gap-2 mb-4">
              {[
                { value: 'trending', label: '🔥 Trending Ideas', desc: 'AI generates current opportunities' },
                { value: 'urls', label: '🔗 Analyze URLs', desc: 'Paste links to scrape & analyze' },
                { value: 'topics', label: '💡 Topic Brainstorm', desc: 'Give topics, get research angles' },
                { value: 'web-scout', label: '🕷️ Web Scout', desc: 'Find posts matching your voice' },
              ].map(m => (
                <button
                  key={m.value}
                  onClick={() => setAutoMode(m.value)}
                  className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                    autoMode === m.value ? 'border-noch-green bg-noch-green/5' : 'border-noch-border hover:border-noch-green/30'
                  }`}
                >
                  <div className="text-white text-xs font-semibold">{m.label}</div>
                  <div className="text-noch-muted text-xs">{m.desc}</div>
                </button>
              ))}
            </div>

            {autoMode === 'urls' && (
              <div className="mb-4">
                <label className="text-noch-muted text-xs mb-1 block">Paste URLs (one per line)</label>
                <textarea
                  value={autoUrls}
                  onChange={e => setAutoUrls(e.target.value)}
                  placeholder={"https://instagram.com/...\nhttps://tiktok.com/...\nhttps://..."}
                  className="input w-full h-24 resize-none text-sm font-mono"
                />
              </div>
            )}

            {autoMode === 'topics' && (
              <div className="mb-4">
                <label className="text-noch-muted text-xs mb-1 block">Topics (comma-separated)</label>
                <input
                  value={autoTopics}
                  onChange={e => setAutoTopics(e.target.value)}
                  placeholder="matcha trends, Ramadan content, summer drinks, Gen Z Libya..."
                  className="input w-full text-sm"
                />
              </div>
            )}

            {autoMode === 'trending' && (
              <div className="bg-noch-dark/40 rounded-lg p-3 mb-4">
                <p className="text-noch-muted text-xs">Claude will generate 5 timely content opportunities for <span className="text-white">{brand?.name}</span> based on current trends, platform formats, and the Libyan market.</p>
              </div>
            )}

            {autoMode === 'web-scout' && (
              <div className="bg-noch-dark/40 rounded-lg p-3 mb-4">
                <p className="text-noch-muted text-xs">Claude will search the web for social media posts matching <span className="text-white">{brand?.name}</span>'s voice. Results are saved to your <span className="text-noch-green">Swipe File</span> for inspiration.</p>
                <p className="text-noch-muted text-[10px] mt-1">Uses Google CSE (if configured) or DuckDuckGo as fallback. No API key needed for DuckDuckGo.</p>
              </div>
            )}

            <button
              onClick={autoMode === 'web-scout' ? runWebScout : runAutoResearch}
              disabled={autoRunning || scouting}
              className="btn-primary flex items-center gap-2"
            >
              {(autoRunning || scouting) ? (
                <><RefreshCw size={15} className="animate-spin" /> {scouting ? 'Scouting...' : 'Running...'}</>
              ) : autoMode === 'web-scout' ? (
                <><Sparkles size={15} /> Run Web Scout</>
              ) : (
                <><Zap size={15} /> Run Auto Research</>
              )}
            </button>
          </div>
        )}

        {/* Research Tab */}
        {activeTab === 'research' && (
          <>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search research..."
                  className="input pl-8 w-full text-sm"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                {SOURCE_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setFilter(t.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      filter === t.value
                        ? 'bg-noch-green text-noch-dark'
                        : 'border border-noch-border text-noch-muted hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button onClick={loadResearch} className="p-2 border border-noch-border rounded-lg text-noch-muted hover:text-white transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>

            <p className="text-noch-muted text-xs mb-4">{filtered.length} items</p>

            {loading ? (
              <div className="text-center py-12 text-noch-muted">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 bg-noch-card border border-noch-border rounded-xl">
                <BookOpen size={32} className="text-noch-muted mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-2">No research yet</h3>
                <p className="text-noch-muted text-sm mb-4">Scout trends, save links, capture ideas</p>
                {isOwner && (
                  <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
                    Add first research
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(item => (
                  <ResearchCard
                    key={item.id}
                    item={item}
                    onUse={handleUse}
                    onDelete={handleDelete}
                    onStatus={(id, status) => updateResearch(id, { status }).then(loadResearch)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Swipe File Tab */}
        {activeTab === 'swipe' && (
          <>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setSwipeFile(sf => [...sf].sort((a, b) => b.voice_similarity_score - a.voice_similarity_score))}
                  className="text-xs px-2.5 py-1 rounded-full border border-noch-border text-noch-muted hover:text-white transition-colors"
                >
                  Sort by score
                </button>
                <button
                  onClick={() => setSwipeFile(sf => {
                    const curated = sf.filter(s => s.is_curated)
                    const rest = sf.filter(s => !s.is_curated)
                    return [...curated, ...rest]
                  })}
                  className="text-xs px-2.5 py-1 rounded-full border border-noch-border text-noch-muted hover:text-white transition-colors"
                >
                  Curated first
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={loadSwipeFile} className="p-2 border border-noch-border rounded-lg text-noch-muted hover:text-white transition-colors">
                  <RefreshCw size={13} />
                </button>
                <button
                  onClick={() => { setShowAutoResearch(true); setAutoMode('web-scout') }}
                  className="flex items-center gap-2 px-3 py-2 border border-noch-green/40 rounded-xl text-noch-green hover:bg-noch-green/10 transition-colors text-sm font-medium"
                >
                  <Sparkles size={15} /> Web Scout
                </button>
              </div>
            </div>

            <p className="text-noch-muted text-xs mb-4">
              {swipeFile.length} posts collected · {swipeFile.filter(s => s.is_curated).length} curated
            </p>

            {swipeLoading ? (
              <div className="text-center py-12 text-noch-muted">Loading swipe file...</div>
            ) : swipeFile.length === 0 ? (
              <div className="text-center py-16 bg-noch-card border border-noch-border rounded-xl">
                <Sparkles size={32} className="text-noch-muted mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-2">Swipe file empty</h3>
                <p className="text-noch-muted text-sm mb-4">Run Web Scout to find posts matching your brand voice</p>
                <button
                  onClick={() => { setShowAutoResearch(true); setAutoMode('web-scout') }}
                  className="btn-primary text-sm flex items-center gap-2 mx-auto"
                >
                  <Sparkles size={15} /> Run Web Scout
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {swipeFile.map(item => (
                  <SwipeCard
                    key={item.id}
                    item={item}
                    onCurate={handleCurate}
                    onUse={handleSwipeUse}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Scout Sources Tab */}
        {activeTab === 'scout' && (
          <>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Radar size={18} className="text-noch-green" /> Scout Sources
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscover}
                  disabled={discoverLoading}
                  className="flex items-center gap-2 px-3 py-2 border border-noch-green/40 rounded-xl text-noch-green hover:bg-noch-green/10 transition-colors text-sm font-medium"
                >
                  {discoverLoading ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
                  Discover Tripoli Pages
                </button>
                <button
                  onClick={() => setShowAddSource(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-noch-border rounded-xl text-noch-muted hover:text-white transition-colors text-sm"
                >
                  <Plus size={14} /> Add Source
                </button>
                <button
                  onClick={handleScrapeAll}
                  disabled={scrapeAllLoading}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {scrapeAllLoading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Scrape All Active
                </button>
              </div>
            </div>

            {/* Add Source Form */}
            {showAddSource && (
              <div className="bg-noch-card border border-noch-green/30 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-bold text-sm">Add Scout Source</h3>
                  <button onClick={() => setShowAddSource(false)} className="text-noch-muted hover:text-white"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Page URL</label>
                    <input
                      value={addSourceForm.url}
                      onChange={e => {
                        const url = e.target.value
                        setAddSourceForm(f => ({ ...f, url, platform: autoDetectPlatform(url) }))
                      }}
                      placeholder="https://facebook.com/pagename"
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Page Name</label>
                    <input
                      value={addSourceForm.name}
                      onChange={e => setAddSourceForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Cafe Name (optional)"
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Platform</label>
                    <select
                      value={addSourceForm.platform}
                      onChange={e => setAddSourceForm(f => ({ ...f, platform: e.target.value }))}
                      className="input w-full text-sm"
                    >
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Category</label>
                    <select
                      value={addSourceForm.category}
                      onChange={e => setAddSourceForm(f => ({ ...f, category: e.target.value }))}
                      className="input w-full text-sm"
                    >
                      <option value="competitor">Competitor</option>
                      <option value="inspiration">Inspiration</option>
                      <option value="meme">Meme</option>
                      <option value="lifestyle">Lifestyle</option>
                      <option value="food">Food</option>
                      <option value="dialect">Dialect</option>
                    </select>
                  </div>
                </div>
                <button onClick={handleAddSource} className="btn-primary text-sm">Add Source</button>
              </div>
            )}

            {/* Discover Results Modal */}
            {discoverResults && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg">Discovered Pages ({discoverResults.length})</h3>
                    <button onClick={() => setDiscoverResults(null)} className="text-noch-muted hover:text-white"><X size={18} /></button>
                  </div>
                  <p className="text-noch-muted text-xs mb-4">Select pages to add as scout sources</p>
                  <div className="space-y-2 mb-4">
                    {discoverResults.map((item, i) => (
                      <label key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedDiscover.has(i) ? 'border-noch-green/40 bg-noch-green/5' : 'border-noch-border hover:border-noch-green/20'
                      }`}>
                        <input
                          type="checkbox"
                          checked={selectedDiscover.has(i)}
                          onChange={() => {
                            setSelectedDiscover(prev => {
                              const next = new Set(prev)
                              if (next.has(i)) next.delete(i); else next.add(i)
                              return next
                            })
                          }}
                          className="accent-noch-green"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium truncate">{item.page_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              item.platform === 'instagram' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>{item.platform}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-noch-border/50 text-noch-muted capitalize">{item.category}</span>
                          </div>
                          <p className="text-noch-muted text-xs truncate">{item.page_url}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setDiscoverResults(null)} className="flex-1 px-4 py-2 border border-noch-border rounded-lg text-noch-muted hover:text-white transition-colors text-sm">
                      Cancel
                    </button>
                    <button onClick={handleAddDiscovered} disabled={selectedDiscover.size === 0} className="flex-1 btn-primary">
                      Add {selectedDiscover.size} Selected
                    </button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-noch-muted text-xs mb-4">
              {scoutSources.length} sources · {scoutSources.filter(s => s.is_active).length} active
            </p>

            {scoutLoading ? (
              <div className="text-center py-12 text-noch-muted">Loading sources...</div>
            ) : scoutSources.length === 0 ? (
              <div className="text-center py-16 bg-noch-card border border-noch-border rounded-xl">
                <Radar size={32} className="text-noch-muted mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-2">No scout sources yet</h3>
                <p className="text-noch-muted text-sm mb-4">Add Facebook/Instagram pages to scrape for content inspiration</p>
                <div className="flex items-center gap-2 justify-center">
                  <button onClick={() => setShowAddSource(true)} className="text-sm border border-noch-border text-noch-muted hover:text-white px-3 py-2 rounded-xl transition-colors">
                    <Plus size={14} className="inline mr-1" /> Add Manually
                  </button>
                  <button onClick={handleDiscover} disabled={discoverLoading} className="btn-primary text-sm flex items-center gap-2">
                    <Globe size={14} /> Discover Pages
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scoutSources.map(source => (
                  <div key={source.id} className={`bg-noch-card border rounded-xl p-4 transition-colors ${source.is_active ? 'border-noch-border hover:border-noch-green/20' : 'border-noch-border/50 opacity-60'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-white font-semibold text-sm truncate">{source.page_name || 'Unnamed'}</h4>
                          {source.page_name_ar && (
                            <span className="text-noch-muted text-xs truncate" dir="rtl">{source.page_name_ar}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            source.platform === 'instagram' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>{source.platform}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-noch-border/50 text-noch-muted capitalize">{source.category || 'other'}</span>
                          {source.city && (
                            <span className="text-[10px] text-noch-muted">{source.city}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleSource(source)}
                        className={`shrink-0 transition-colors ${source.is_active ? 'text-noch-green' : 'text-noch-muted'}`}
                        title={source.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                      >
                        {source.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </div>

                    <div className="flex items-center gap-3 text-noch-muted text-xs mb-3">
                      <span>{source.total_posts_collected || 0} posts</span>
                      <span>scraped {source.scrape_count || 0}x</span>
                      {source.last_scraped_at && (
                        <span>last: {new Date(source.last_scraped_at).toLocaleDateString()}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-noch-border/30">
                      <a
                        href={source.page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-noch-muted hover:text-white transition-colors"
                      >
                        <ExternalLink size={11} /> Visit
                      </a>
                      <button
                        onClick={() => handleScrapeOne(source)}
                        className="flex items-center gap-1 text-xs text-noch-green border border-noch-green/30 px-2 py-1 rounded-lg hover:bg-noch-green/10 transition-colors ms-auto"
                      >
                        <RefreshCw size={11} /> Scrape Now
                      </button>
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        className="text-noch-muted hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {showAdd && (
          <AddResearchModal
            brandId={brandId}
            onSave={handleAdd}
            onClose={() => setShowAdd(false)}
          />
        )}
      </div>
    </Layout>
  )
}
