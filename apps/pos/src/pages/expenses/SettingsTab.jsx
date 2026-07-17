// SettingsTab.jsx — Expenses: owner-only categories / cost centers / rates
import { useState, useEffect } from 'react'
import { Plus, Loader2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

export default function SettingsTab({ onMetaChanged }) {
  const [costCenters, setCostCenters] = useState([])
  const [categories, setCategories] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editRate, setEditRate] = useState({})
  const [saving, setSaving] = useState(false)

  // Category inputs
  const [newCat, setNewCat] = useState('')
  const [editingCat, setEditingCat] = useState(null)
  const [editCatName, setEditCatName] = useState('')
  const [confirmDelCat, setConfirmDelCat] = useState(null)

  // Cost center inputs
  const [newCcId, setNewCcId] = useState('')
  const [newCcName, setNewCcName] = useState('')
  const [editingCc, setEditingCc] = useState(null)
  const [editCcName, setEditCcName] = useState('')
  const [confirmDelCc, setConfirmDelCc] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [ccs, cats, rs] = await Promise.all([
      supabase.from('cost_centers').select('*').order('id').then(r => r.data || []),
      supabase.from('expense_categories').select('*').order('name').then(r => r.data || []),
      supabase.from('cc_exchange_rates').select('*').order('currency').then(r => r.data || []),
    ])
    setCostCenters(ccs)
    setCategories(cats)
    setRates(rs)
    const rateMap = {}; rs.forEach(r => { rateMap[r.currency] = r.rate_to_lyd })
    setEditRate(rateMap)
    setLoading(false)
  }

  function refreshAll() {
    load()
    if (onMetaChanged) onMetaChanged()
  }

  async function saveRates() {
    setSaving(true)
    try {
      for (const [currency, rate] of Object.entries(editRate)) {
        await supabase.from('cc_exchange_rates')
          .upsert({ currency, rate_to_lyd: parseFloat(rate), updated_at: new Date().toISOString() }, { onConflict: 'currency' })
      }
      toast.success('Exchange rates saved')
      load()
    } catch (err) { toast.error(err.message) }
    setSaving(false)
  }

  // Categories
  async function addCategory() {
    if (!newCat.trim()) { toast.error('Enter category name'); return }
    const { error } = await supabase.from('expense_categories').insert({ name: newCat.trim() })
    if (error) { toast.error(error.message); return }
    setNewCat('')
    toast.success('Category added')
    refreshAll()
  }
  async function saveCategoryName(id) {
    if (!editCatName.trim()) { toast.error('Name required'); return }
    const { error } = await supabase.from('expense_categories').update({ name: editCatName.trim() }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setEditingCat(null); setEditCatName('')
    toast.success('Category renamed')
    refreshAll()
  }
  async function deleteCategory(id) {
    const { error } = await supabase.from('expense_categories').delete().eq('id', id)
    if (error) { toast.error('Cannot delete — category may be in use by existing expenses'); return }
    setConfirmDelCat(null)
    toast.success('Category removed')
    refreshAll()
  }

  // Cost Centers
  async function addCostCenter() {
    const id = newCcId.trim().toUpperCase()
    const name = newCcName.trim()
    if (!id || !name) { toast.error('Both code and name required'); return }
    const { error } = await supabase.from('cost_centers').insert({ id, name })
    if (error) { toast.error(error.message); return }
    setNewCcId(''); setNewCcName('')
    toast.success('Cost center added')
    refreshAll()
  }
  async function saveCcName(id) {
    if (!editCcName.trim()) { toast.error('Name required'); return }
    const { error } = await supabase.from('cost_centers').update({ name: editCcName.trim() }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setEditingCc(null); setEditCcName('')
    toast.success('Cost center renamed')
    refreshAll()
  }
  async function deleteCostCenter(id) {
    const { error } = await supabase.from('cost_centers').delete().eq('id', id)
    if (error) { toast.error('Cannot delete — cost center may be in use by existing expenses'); return }
    setConfirmDelCc(null)
    toast.success('Cost center removed')
    refreshAll()
  }

  if (loading) return <div className="flex items-center justify-center py-12 text-noch-muted"><Loader2 size={20} className="animate-spin mr-2" />Loading…</div>

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Expense Categories — at top */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3">Expense Categories</h3>
        <div className="space-y-1 mb-4">
          {categories.length === 0 && <p className="text-xs text-noch-muted">No categories yet — add one below.</p>}
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 p-2 rounded-lg bg-noch-dark/40">
              {editingCat === cat.id ? (
                <>
                  <input type="text" value={editCatName} onChange={e => setEditCatName(e.target.value)} autoFocus
                    className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-noch-green/50" />
                  <button onClick={() => saveCategoryName(cat.id)} className="text-xs text-noch-green px-2 py-1 hover:underline">Save</button>
                  <button onClick={() => { setEditingCat(null); setEditCatName('') }} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : confirmDelCat === cat.id ? (
                <>
                  <span className="text-sm text-red-400 flex-1">Delete "{cat.name}" permanently?</span>
                  <button onClick={() => deleteCategory(cat.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600">Delete</button>
                  <button onClick={() => setConfirmDelCat(null)} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-sm text-white flex-1">{cat.name}</span>
                  <button onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name) }} className="text-xs text-noch-muted hover:text-white px-2 py-1">Rename</button>
                  <button onClick={() => setConfirmDelCat(cat.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" placeholder="New category name…" value={newCat} onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50" />
          <button onClick={addCategory}
            className="bg-noch-green text-black px-3 py-2 rounded-lg text-sm font-semibold hover:bg-noch-green/90 flex items-center gap-1">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Cost Centers */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3">Cost Centers</h3>
        <div className="space-y-1 mb-4">
          {costCenters.length === 0 && <p className="text-xs text-noch-muted">No cost centers yet — add one below.</p>}
          {costCenters.map(cc => (
            <div key={cc.id} className="flex items-center gap-3 p-2 rounded-lg bg-noch-dark/40">
              <span className="text-xs font-mono text-noch-muted w-14">{cc.id}</span>
              {editingCc === cc.id ? (
                <>
                  <input type="text" value={editCcName} onChange={e => setEditCcName(e.target.value)} autoFocus
                    className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-noch-green/50" />
                  <button onClick={() => saveCcName(cc.id)} className="text-xs text-noch-green px-2 py-1 hover:underline">Save</button>
                  <button onClick={() => { setEditingCc(null); setEditCcName('') }} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : confirmDelCc === cc.id ? (
                <>
                  <span className="text-sm text-red-400 flex-1">Delete "{cc.name}" permanently?</span>
                  <button onClick={() => deleteCostCenter(cc.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600">Delete</button>
                  <button onClick={() => setConfirmDelCc(null)} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-sm text-white flex-1">{cc.name}</span>
                  <button onClick={() => { setEditingCc(cc.id); setEditCcName(cc.name) }} className="text-xs text-noch-muted hover:text-white px-2 py-1">Rename</button>
                  <button onClick={() => setConfirmDelCc(cc.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" placeholder="Code (e.g. CC04)" value={newCcId} onChange={e => setNewCcId(e.target.value)}
            className="w-28 bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50 font-mono" />
          <input type="text" placeholder="Name" value={newCcName} onChange={e => setNewCcName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCostCenter()}
            className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50" />
          <button onClick={addCostCenter}
            className="bg-noch-green text-black px-3 py-2 rounded-lg text-sm font-semibold hover:bg-noch-green/90 flex items-center gap-1">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Exchange Rates */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3">Exchange Rates to LYD</h3>
        <p className="text-xs text-noch-muted mb-3">These rates are local to this module — update them independently.</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {rates.map(r => (
            <div key={r.currency} className="flex items-center gap-2">
              <span className="text-xs text-noch-muted w-10">{r.currency}</span>
              <input
                type="number" min="0" step="0.001"
                value={editRate[r.currency] ?? r.rate_to_lyd}
                onChange={e => setEditRate(prev => ({ ...prev, [r.currency]: e.target.value }))}
                disabled={r.currency === 'LYD'}
                className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-noch-green/50 disabled:opacity-40"
              />
            </div>
          ))}
        </div>
        <button onClick={saveRates} disabled={saving}
          className="bg-noch-green text-black px-4 py-2 rounded-lg text-xs font-semibold hover:bg-noch-green/90 flex items-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Save Rates
        </button>
      </div>
    </div>
  )
}
