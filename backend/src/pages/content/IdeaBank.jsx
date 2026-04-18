// IdeaBank.jsx — Content Idea Bank with AI scoring
// Route: /content/ideas?brand={id}

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Lightbulb, Plus, X, Upload, Star, Filter, Search, Trash2, Zap } from 'lucide-react'
import {
  getContentIdeas, createContentIdea, updateContentIdea,
  deleteContentIdea, uploadIdeaImage, getBrand
} from '../../lib/supabase'
import { scoreIdeaAgainstBrand } from '../../lib/claudeClient'
import { useLanguage } from '../../contexts/LanguageContext'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

const PILLARS = [
  { id: 'notchis_world', label: "Notchi's World", color: 'bg-purple-500' },
  { id: 'the_drop', label: 'The Drop', color: 'bg-blue-500' },
  { id: 'craft_moment', label: 'The Craft', color: 'bg-amber-500' },
  { id: 'real_moment', label: 'Real Moments', color: 'bg-pink-500' },
  { id: 'reactive', label: 'Reactive', color: 'bg-yellow-500' },
  { id: 'joyful_nihilism', label: 'Joyful Nihilism', color: 'bg-teal-500' },
]

const PLATFORMS = [
  { id: 'instagram', emoji: '📸', label: 'Instagram' },
  { id: 'tiktok', emoji: '🎵', label: 'TikTok' },
  { id: 'twitter', emoji: '🐦', label: 'X / Twitter' },
  { id: 'other', emoji: '🔗', label: 'Other' },
  { id: 'manual', emoji: '✏️', label: 'Manual' },
]

const STATUSES = ['raw', 'candidate', 'in_production', 'used', 'archived']

const STATUS_COLORS = {
  raw: 'text-noch-muted border-noch-border',
  candidate: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  in_production: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5',
  used: 'text-noch-green border-noch-green/30 bg-noch-green/5',
  archived: 'text-noch-muted border-noch-border bg-noch-border/20',
}

const PILLAR_COLORS = {
  notchis_world: 'text-purple-400 bg-purple-400/10',
  the_drop: 'text-blue-400 bg-blue-400/10',
  craft_moment: 'text-amber-400 bg-amber-400/10',
  real_moment: 'text-pink-400 bg-pink-400/10',
  reactive: 'text-yellow-400 bg-yellow-400/10',
  joyful_nihilism: 'text-teal-400 bg-teal-400/10',
}

function IdeaCard({ idea, onEdit, onDelete }) {
  const pillar = PILLARS.find(p => p.id === idea.content_pillar)
  const platform = PLATFORMS.find(p => p.id === idea.source_platform)

  return (
    <div
      className="bg-noch-card border border-noch-border rounded-xl overflow-hidden cursor-pointer hover:border-noch-green/30 transition-all"
      onClick={() => onEdit(idea)}
    >
      {idea.image_url && (
        <img src={idea.image_url} alt="" className="w-full h-32 object-cover" />
      )}
      {!idea.image_url && (
        <div className="w-full h-20 bg-noch-border/20 flex items-center justify-center">
          <span className="text-3xl">{platform?.emoji || '💡'}</span>
        </div>
      )}

      <div className="p-3">
        {idea.title && <p className="text-white font-semibold text-sm mb-1 line-clamp-2">{idea.title}</p>}
        {idea.notes && <p className="text-noch-muted text-xs line-clamp-2 mb-2">{idea.notes}</p>}

        <div className="flex flex-wrap gap-1.5">
          {/* Status */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${STATUS_COLORS[idea.status] || STATUS_COLORS.raw}`}>
            {idea.status}
          </span>

          {/* Pillar */}
          {pillar && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PILLAR_COLORS[idea.content_pillar] || ''}`}>
              {pillar.label}
            </span>
          )}

          {/* Platform */}
          {platform && (
            <span className="text-[10px] text-noch-muted">{platform.emoji}</span>
          )}
        </div>

        {/* AI score */}
        {idea.ai_score != null && (
          <div className="flex items-center gap-1 mt-2">
            <Star size={10} className="text-yellow-400" />
            <span className="text-yellow-400 text-xs font-bold">{idea.ai_score}/10</span>
          </div>
        )}
      </div>
    </div>
  )
}

function IdeaModal({ idea, brandId, brand, onSave, onClose }) {
  const isEdit = !!idea?.id
  const [form, setForm] = useState(idea || {
    title: '', notes: '', source_url: '', source_platform: 'manual',
    content_pillar: '', tags: [], status: 'raw', image_url: '', brand_id: brandId,
  })
  const [saving, setSaving] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isEdit) {
        await updateContentIdea(idea.id, form)
      } else {
        await createContentIdea({ ...form, brand_id: brandId })
      }
      toast.success(isEdit ? 'Idea updated' : 'Idea added')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this idea?')) return
    try {
      await deleteContentIdea(idea.id)
      toast.success('Idea deleted')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadIdeaImage(file, brandId)
      set('image_url', url)
      toast.success('Image uploaded')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleScore = async () => {
    if (!brand) return toast.error('No brand loaded')
    setScoring(true)
    try {
      const result = await scoreIdeaAgainstBrand(form, brand)
      if (result) {
        const updates = {
          ai_score: result.score,
          ai_notes: `${result.recommendation}\n\nWhy: ${result.why}`,
          content_pillar: result.pillar_fit || form.content_pillar,
        }
        set('ai_score', result.score)
        set('ai_notes', updates.ai_notes)
        if (result.pillar_fit) set('content_pillar', result.pillar_fit)
        if (isEdit) await updateContentIdea(idea.id, updates)
        toast.success(`AI Score: ${result.score}/10`)
      }
    } catch (err) {
      toast.error(err.message || 'Scoring failed')
    } finally {
      setScoring(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-noch-border">
          <h2 className="text-white font-bold">{isEdit ? 'Edit Idea' : 'Add Idea'}</h2>
          <div className="flex items-center gap-2">
            {isEdit && (
              <button onClick={handleDelete} className="text-noch-muted hover:text-red-400 p-1">
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-noch-muted hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {/* Image */}
          {form.image_url ? (
            <div className="relative">
              <img src={form.image_url} alt="" className="w-full h-40 object-cover rounded-xl" />
              <button
                onClick={() => set('image_url', '')}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full h-24 border-2 border-dashed border-noch-border rounded-xl flex flex-col items-center justify-center text-noch-muted hover:border-noch-green/30 hover:text-white transition-all"
            >
              <Upload size={20} className="mb-1" />
              <span className="text-xs">{uploading ? 'Uploading...' : 'Upload screenshot'}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

          <div>
            <label className="label block mb-1">Title</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className="input w-full" placeholder="Idea title..." />
          </div>

          <div>
            <label className="label block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="input w-full resize-none" rows={3} placeholder="What's the idea..." />
          </div>

          <div>
            <label className="label block mb-1">Source URL</label>
            <input value={form.source_url} onChange={e => set('source_url', e.target.value)} className="input w-full" placeholder="https://..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1">Platform</label>
              <select value={form.source_platform} onChange={e => set('source_platform', e.target.value)} className="input w-full">
                {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="input w-full capitalize">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label block mb-1">Content Pillar</label>
            <select value={form.content_pillar} onChange={e => set('content_pillar', e.target.value)} className="input w-full">
              <option value="">— Select pillar —</option>
              {PILLARS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          {/* AI Score display */}
          {form.ai_score != null && (
            <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Star size={14} className="text-yellow-400" />
                <span className="text-yellow-400 font-bold">{form.ai_score}/10</span>
              </div>
              {form.ai_notes && <p className="text-noch-muted text-xs">{form.ai_notes}</p>}
            </div>
          )}

          {/* Score with AI button */}
          <button
            onClick={handleScore}
            disabled={scoring}
            className="btn-secondary flex items-center justify-center gap-2 py-2.5 text-sm"
          >
            <Zap size={14} className={scoring ? 'animate-pulse text-noch-green' : ''} />
            {scoring ? 'Scoring...' : 'Score with AI'}
          </button>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : (isEdit ? 'Update' : 'Add Idea')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function IdeaBank() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const brandId = searchParams.get('brand')

  const [brand, setBrand] = useState(null)
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editIdea, setEditIdea] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPillar, setFilterPillar] = useState('all')

  useEffect(() => {
    if (brandId) {
      getBrand(brandId).then(setBrand).catch(() => {})
      loadIdeas()
    } else {
      setLoading(false)
    }
  }, [brandId])

  const loadIdeas = async () => {
    try {
      const data = await getContentIdeas(brandId)
      setIdeas(data)
    } catch (err) {
      toast.error('Failed to load ideas')
    } finally {
      setLoading(false)
    }
  }

  const filtered = ideas.filter(idea => {
    const matchSearch = !search ||
      (idea.title && idea.title.toLowerCase().includes(search.toLowerCase())) ||
      (idea.notes && idea.notes.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = filterStatus === 'all' || idea.status === filterStatus
    const matchPillar = filterPillar === 'all' || idea.content_pillar === filterPillar
    return matchSearch && matchStatus && matchPillar
  })

  const candidateCount = ideas.filter(i => i.status === 'candidate').length

  if (!brandId) return (
    <Layout>
      <div className="card text-center py-12">
        <p className="text-noch-muted">No brand selected. Go to Content Studio first.</p>
        <button onClick={() => navigate('/content')} className="btn-secondary mt-4">Go to Content</button>
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Lightbulb size={20} className="text-noch-green" />
              {ar ? 'بنك الأفكار' : 'Idea Bank'}
            </h1>
            {brand && <p className="text-noch-muted text-sm">{brand.name}</p>}
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} />
            {ar ? 'فكرة جديدة' : 'Add Idea'}
          </button>
        </div>

        {/* Candidate banner */}
        {candidateCount > 0 && (
          <div
            className="bg-blue-400/10 border border-blue-400/20 rounded-xl px-4 py-3 mb-4 flex items-center justify-between cursor-pointer hover:bg-blue-400/15 transition-all"
            onClick={() => setFilterStatus('candidate')}
          >
            <div className="flex items-center gap-2">
              <Star size={14} className="text-blue-400" />
              <span className="text-blue-400 font-medium text-sm">
                {candidateCount} {ar ? 'فكرة جاهزة للتطوير' : `idea${candidateCount > 1 ? 's' : ''} ready to develop`}
              </span>
            </div>
            <span className="text-noch-muted text-xs">→</span>
          </div>
        )}

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
            <input
              type="text"
              placeholder={ar ? 'ابحث...' : 'Search ideas...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-8 w-full"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="input text-sm"
          >
            <option value="all">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterPillar}
            onChange={e => setFilterPillar(e.target.value)}
            className="input text-sm"
          >
            <option value="all">All pillars</option>
            {PILLARS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        {/* Ideas grid */}
        {loading ? (
          <p className="text-noch-muted text-center py-12">Loading ideas...</p>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12">
            <Lightbulb size={40} className="text-noch-muted mx-auto mb-3" />
            <p className="text-noch-muted mb-3">
              {search || filterStatus !== 'all' || filterPillar !== 'all'
                ? 'No ideas match your filters'
                : (ar ? 'لا توجد أفكار بعد' : 'No ideas yet')}
            </p>
            {!search && filterStatus === 'all' && filterPillar === 'all' && (
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                {ar ? 'أضف أول فكرة' : 'Add your first idea'}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map(idea => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onEdit={setEditIdea}
                onDelete={() => loadIdeas()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <IdeaModal
          brandId={brandId}
          brand={brand}
          onSave={() => { setShowAdd(false); loadIdeas() }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editIdea && (
        <IdeaModal
          idea={editIdea}
          brandId={brandId}
          brand={brand}
          onSave={() => { setEditIdea(null); loadIdeas() }}
          onClose={() => setEditIdea(null)}
        />
      )}
    </Layout>
  )
}
