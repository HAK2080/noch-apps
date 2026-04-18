// LoyaltyGestures.jsx — Manage gesture/content library for Nochi
// Route: /loyalty/gestures
// Table: loyalty_gestures (content_type, content_ar, content_en, is_active)

import { useState, useEffect } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

const CONTENT_TYPES = ['prayer', 'hydration', 'word', 'puzzle', 'humor', 'affirmation', 'fun_fact']

const TYPE_CONFIG = {
  prayer: { emoji: '🕌', label: 'Prayer Times' },
  hydration: { emoji: '💧', label: 'Hydration' },
  word: { emoji: '📖', label: 'Word of Day' },
  puzzle: { emoji: '🧩', label: 'Puzzle' },
  humor: { emoji: '😄', label: 'Humor' },
  affirmation: { emoji: '✨', label: 'Affirmation' },
  fun_fact: { emoji: '🌍', label: 'Fun Fact' },
}

const BLANK = { content_type: 'humor', content_ar: '', content_en: '', is_active: true }

export default function LoyaltyGestures() {
  const [gestures, setGestures] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [filterType, setFilterType] = useState('all')

  const load = async () => {
    const { data, error } = await supabase
      .from('loyalty_gestures')
      .select('*')
      .order('content_type')
      .order('created_at', { ascending: true })
    if (!error) setGestures(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openEdit = (g) => {
    setEditId(g.id)
    setForm({
      content_type: g.content_type,
      content_ar: g.content_ar || '',
      content_en: g.content_en || '',
      is_active: g.is_active !== false,
    })
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.content_ar.trim() && !form.content_en.trim()) {
      toast.error('At least one language required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        content_type: form.content_type,
        content_ar: form.content_ar.trim(),
        content_en: form.content_en.trim(),
        is_active: form.is_active,
      }
      if (editId) {
        await supabase.from('loyalty_gestures').update(payload).eq('id', editId)
        toast.success('Updated')
      } else {
        await supabase.from('loyalty_gestures').insert(payload)
        toast.success('Added')
      }
      setShowAdd(false)
      setEditId(null)
      setForm({ ...BLANK })
      load()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (g) => {
    await supabase.from('loyalty_gestures').update({ is_active: !g.is_active }).eq('id', g.id)
    setGestures(prev => prev.map(x => x.id === g.id ? { ...x, is_active: !x.is_active } : x))
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this gesture?')) return
    await supabase.from('loyalty_gestures').delete().eq('id', id)
    setGestures(prev => prev.filter(g => g.id !== id))
    toast.success('Deleted')
  }

  const filtered = filterType === 'all'
    ? gestures
    : gestures.filter(g => g.content_type === filterType)

  // Group by content_type
  const grouped = CONTENT_TYPES.reduce((acc, type) => {
    const items = filtered.filter(g => g.content_type === type)
    if (items.length) acc[type] = items
    return acc
  }, {})

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white font-bold text-xl">Daily Gestures</h1>
            <p className="text-noch-muted text-sm">{gestures.length} total · {gestures.filter(g => g.is_active).length} active</p>
          </div>
          <button onClick={() => { setEditId(null); setForm({ ...BLANK }); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Gesture
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          <button onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 text-sm rounded-lg border whitespace-nowrap transition-colors ${filterType === 'all' ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'border-noch-border text-noch-muted hover:text-white'}`}>
            All ({gestures.length})
          </button>
          {CONTENT_TYPES.map(type => {
            const cfg = TYPE_CONFIG[type]
            const count = gestures.filter(g => g.content_type === type).length
            return (
              <button key={type} onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 text-sm rounded-lg border whitespace-nowrap transition-colors ${filterType === type ? 'bg-noch-green/10 text-noch-green border-noch-green/30' : 'border-noch-border text-noch-muted hover:text-white'}`}>
                {cfg.emoji} {cfg.label} ({count})
              </button>
            )
          })}
        </div>

        {loading ? (
          <p className="text-noch-muted text-center py-16">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12 text-noch-muted">
            <p className="text-4xl mb-3">💌</p>
            <p>No gestures yet. Add your first one!</p>
          </div>
        ) : (
          Object.entries(grouped).map(([type, items]) => {
            const cfg = TYPE_CONFIG[type] || { emoji: '📝', label: type }
            return (
              <div key={type} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{cfg.emoji}</span>
                  <p className="text-noch-muted text-xs font-semibold uppercase tracking-wider">{cfg.label}</p>
                  <span className="text-[10px] text-noch-muted">({items.length})</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map(g => (
                    <div key={g.id} className={`card flex items-start gap-3 ${!g.is_active ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">{g.content_ar}</p>
                        {g.content_en && <p className="text-noch-muted text-xs mt-0.5 italic">{g.content_en}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(g)} className="p-1.5 text-noch-muted hover:text-white transition-colors text-xs">Edit</button>
                        <button onClick={() => toggleActive(g)} className="p-1.5 transition-colors">
                          {g.is_active
                            ? <ToggleRight size={18} className="text-noch-green" />
                            : <ToggleLeft size={18} className="text-noch-muted" />}
                        </button>
                        <button onClick={() => handleDelete(g.id)} className="p-1.5 text-noch-muted hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-noch-border">
              <h2 className="text-white font-bold">{editId ? 'Edit Gesture' : 'New Gesture'}</h2>
              <button onClick={() => { setShowAdd(false); setEditId(null) }} className="text-noch-muted hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <label className="label block mb-1">Content Type</label>
                <select className="input w-full" value={form.content_type} onChange={e => set('content_type', e.target.value)}>
                  {CONTENT_TYPES.map(t => (
                    <option key={t} value={t}>{TYPE_CONFIG[t]?.emoji} {TYPE_CONFIG[t]?.label || t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label block mb-1">Arabic Content *</label>
                <textarea
                  className="input w-full resize-none text-right"
                  dir="rtl"
                  rows={3}
                  value={form.content_ar}
                  onChange={e => set('content_ar', e.target.value)}
                  placeholder="النص العربي..."
                />
              </div>
              <div>
                <label className="label block mb-1">English Content</label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  value={form.content_en}
                  onChange={e => set('content_en', e.target.value)}
                  placeholder="English text..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-noch-green" />
                <span className="text-white text-sm">Active</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAdd(false); setEditId(null) }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving...' : (editId ? 'Update' : 'Add Gesture')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
