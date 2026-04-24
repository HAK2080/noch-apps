// BusinessLinesTab.jsx — Business line P&L view

import { useState, useEffect } from 'react'
import { Plus, X, Loader2, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const COLORS = ['#4ADE80', '#60A5FA', '#F59E0B', '#F87171', '#A78BFA', '#34D399']

function BusinessLineModal({ categories, onSave, onClose }) {
  const [form, setForm] = useState({ name: '', categories: [], color: COLORS[0] })
  const [saving, setSaving] = useState(false)

  const toggleCat = (name) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(name)
        ? f.categories.filter(c => c !== name)
        : [...f.categories, name]
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('business_lines').insert({
        name: form.name.trim(),
        categories: form.categories,
        color: form.color,
      })
      if (error) throw error
      toast.success('Business line created')
      onSave()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-noch-border">
          <h2 className="text-white font-bold">New Business Line</h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label block mb-1">Name *</label>
            <input className="input w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Specialty Coffee, Matcha" />
          </div>
          <div>
            <label className="label block mb-2">Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="label block mb-2">Categories</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button key={cat} onClick={() => toggleCat(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs border font-medium transition-colors ${
                    form.categories.includes(cat)
                      ? 'border-noch-green/50 bg-noch-green/10 text-noch-green'
                      : 'border-noch-border text-noch-muted hover:text-white'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} Create
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BusinessLinesTab() {
  const [lines, setLines] = useState([])
  const [categories, setCategories] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lineStats, setLineStats] = useState({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: linesData }, { data: catData }] = await Promise.all([
        supabase.from('business_lines').select('*').order('name'),
        supabase.from('pos_categories').select('name').order('name'),
      ])
      setLines(linesData || [])
      setCategories((catData || []).map(c => c.name))

      // Compute revenue per business line
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: orders } = await supabase
        .from('pos_order_items')
        .select('category, total_price, pos_orders!inner(status, created_at)')
        .eq('pos_orders.status', 'completed')
        .gte('pos_orders.created_at', since)

      const stats = {}
      for (const line of linesData || []) {
        const lineCats = new Set(line.categories || [])
        const revenue = (orders || [])
          .filter(o => lineCats.has(o.category))
          .reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0)
        stats[line.id] = { revenue }
      }
      setLineStats(stats)
    } catch {}
    finally { setLoading(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this business line?')) return
    try {
      await supabase.from('business_lines').delete().eq('id', id)
      setLines(prev => prev.filter(l => l.id !== id))
      toast.success('Deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="py-16 text-center text-noch-muted">Loading...</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">Business Lines — Last 30 Days</h3>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Add Business Line
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
          <TrendingUp size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
          <p className="text-noch-muted text-sm">No business lines defined yet.</p>
          <p className="text-noch-muted text-xs mt-1">Group your POS categories into business lines to track P&L by segment.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4 mx-auto">Create First Business Line</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {lines.map(line => {
            const s = lineStats[line.id] || { revenue: 0 }
            return (
              <div key={line.id} className="bg-noch-card border border-noch-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: line.color || '#4ADE80' }} />
                    <h4 className="text-white font-semibold">{line.name}</h4>
                  </div>
                  <button onClick={() => handleDelete(line.id)} className="text-noch-muted hover:text-red-400 text-xs">Remove</button>
                </div>
                <div className="text-2xl font-bold text-noch-green mb-1">
                  {s.revenue.toLocaleString('en', { maximumFractionDigits: 0 })} LYD
                </div>
                <p className="text-noch-muted text-xs">Revenue last 30d</p>
                {(line.categories || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {line.categories.map(cat => (
                      <span key={cat} className="text-[10px] px-2 py-0.5 rounded-full bg-noch-dark border border-noch-border text-noch-muted">{cat}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <BusinessLineModal
          categories={categories}
          onSave={() => { setShowModal(false); loadData() }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
