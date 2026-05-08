// src/pages/ideas/IdeasCategories.jsx
import { useState, useEffect } from 'react'
import { ArrowLeft, Trash2, Plus, GripVertical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getIdeaCategories, createIdeaCategory, updateIdeaCategory, deleteIdeaCategory } from '../../lib/ideas-supabase'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

const PALETTE = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ec4899','#ef4444','#6b7280','#14b8a6','#f97316','#64748b']

export default function IdeasCategories() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#10b981')
  const [newIcon, setNewIcon] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    getIdeaCategories().then(setCategories).catch(e => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  const handleRename = async (id, name) => {
    if (!name.trim()) return
    try {
      const updated = await updateIdeaCategory(id, { name: name.trim() })
      setCategories(prev => prev.map(c => c.id === id ? updated : c))
    } catch (err) { toast.error(err.message) }
  }

  const handleColorChange = async (id, color) => {
    try {
      const updated = await updateIdeaCategory(id, { color })
      setCategories(prev => prev.map(c => c.id === id ? updated : c))
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this category? Ideas in this category will be uncategorised.')) return
    try {
      await deleteIdeaCategory(id)
      setCategories(prev => prev.filter(c => c.id !== id))
      toast.success('Category deleted')
    } catch (err) { toast.error(err.message) }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      const cat = await createIdeaCategory({
        name: newName.trim(),
        color: newColor,
        icon: newIcon.trim() || null,
        sort_order: categories.length + 1,
      })
      setCategories(prev => [...prev, cat])
      setNewName('')
      setNewIcon('')
      toast.success('Category added')
    } catch (err) { toast.error(err.message) }
    finally { setAdding(false) }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/ideas')} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-white font-bold text-xl">Idea Categories</h1>
        </div>

        {/* Existing categories */}
        <div className="card mb-6">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 py-3 border-b border-noch-border/50 last:border-0">
              <GripVertical size={14} className="text-noch-muted shrink-0" />
              {/* Color swatch */}
              <div className="relative shrink-0">
                <div className="w-5 h-5 rounded-full border-2 border-white/20" style={{ backgroundColor: cat.color }} />
              </div>
              {/* Icon */}
              <input
                type="text"
                defaultValue={cat.icon || ''}
                onBlur={e => updateIdeaCategory(cat.id, { icon: e.target.value || null })}
                placeholder="✨"
                className="w-10 text-center bg-transparent border border-noch-border rounded px-1 py-0.5 text-sm text-white"
              />
              {/* Name */}
              <input
                type="text"
                defaultValue={cat.name}
                onBlur={e => handleRename(cat.id, e.target.value)}
                className="flex-1 bg-transparent border border-noch-border rounded px-2 py-1 text-sm text-white focus:border-noch-green/50 outline-none"
              />
              {/* Color palette */}
              <div className="flex gap-1 shrink-0">
                {PALETTE.slice(0, 5).map(c => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(cat.id, c)}
                    className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: cat.color === c ? 'white' : 'transparent' }}
                  />
                ))}
              </div>
              <button onClick={() => handleDelete(cat.id)} className="text-noch-muted hover:text-red-400 transition-colors shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="card">
          <h3 className="text-white font-semibold mb-4 text-sm">Add Category</h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newIcon}
                onChange={e => setNewIcon(e.target.value)}
                placeholder="✨"
                className="input w-14 text-center"
              />
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Category name"
                className="input flex-1"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: newColor === c ? 'white' : 'transparent' }}
                />
              ))}
            </div>
            <button type="submit" disabled={!newName.trim() || adding} className="btn-primary flex items-center justify-center gap-2">
              <Plus size={14} />
              {adding ? 'Adding...' : 'Add Category'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}
