import { useEffect, useState } from 'react'
import {
  getIngredients, createIngredient, updateIngredient, deleteIngredient,
  getCurrencyRates, calcCostPerBaseUnit
} from '../../../lib/supabase'
import { FlaskConical, Plus, Search, Edit3, Trash2, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'

const CURRENCIES = ['LYD', 'USD', 'GBP', 'EUR']
const BULK_UNITS = ['kg', 'g', 'L', 'ml', 'piece']
const BASE_UNITS = ['g', 'ml', 'piece']

const emptyForm = {
  name: '',
  base_unit: 'g',
  bulk_qty: '',
  bulk_unit: 'kg',
  bulk_cost: '',
  purchase_currency: 'LYD',
  notes: '',
}

export default function Ingredients() {
  const [ingredients, setIngredients] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const [ings, r] = await Promise.all([getIngredients(), getCurrencyRates()])
      setIngredients(ings)
      setRates(r)
    } catch (err) {
      toast.error('Failed to load ingredients')
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(ing) {
    setForm({
      name: ing.name,
      base_unit: ing.base_unit,
      bulk_qty: ing.bulk_qty,
      bulk_unit: ing.bulk_unit,
      bulk_cost: ing.bulk_cost,
      purchase_currency: ing.purchase_currency,
      notes: ing.notes || '',
    })
    setEditingId(ing.id)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    try {
      const payload = {
        name: form.name,
        base_unit: form.base_unit,
        bulk_qty: parseFloat(form.bulk_qty),
        bulk_unit: form.bulk_unit,
        bulk_cost: parseFloat(form.bulk_cost),
        purchase_currency: form.purchase_currency,
        notes: form.notes || null,
      }
      if (editingId) {
        await updateIngredient(editingId, payload)
        toast.success('Ingredient updated')
      } else {
        await createIngredient(payload)
        toast.success('Ingredient added')
      }
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      await deleteIngredient(id)
      toast.success('Deleted')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  function getCostInfo(ing) {
    const costPerBase = calcCostPerBaseUnit(
      parseFloat(ing.bulk_qty), ing.bulk_unit,
      parseFloat(ing.bulk_cost), ing.purchase_currency, rates
    )
    const totalLyd = parseFloat(ing.bulk_cost) * (rates[ing.purchase_currency] || 1)
    return { costPerBase, totalLyd }
  }

  const filtered = ingredients.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-dark-700 rounded-lg w-48" />
      <div className="glass-card h-96" />
    </div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Ingredient Library</h1>
          <p className="text-gray-500 text-sm mt-1">{ingredients.length} ingredients</p>
        </div>
        <button onClick={openNew} className="neon-btn flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Ingredient
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="neon-input pl-11"
          placeholder="Search ingredients..."
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Name</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Bulk Purchase</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Cost (Original)</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Cost (LYD)</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Cost per {'{unit}'}</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ing) => {
                const { costPerBase, totalLyd } = getCostInfo(ing)
                return (
                  <tr key={ing.id} className="table-row">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-neon-purple/10 border border-neon-purple/20 flex items-center justify-center">
                          <FlaskConical className="w-4 h-4 text-neon-purple" />
                        </div>
                        <div>
                          <span className="font-medium text-gray-200">{ing.name}</span>
                          {ing.notes && <p className="text-xs text-gray-500 mt-0.5">{ing.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-300">
                      {ing.bulk_qty} {ing.bulk_unit}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-300">
                      {parseFloat(ing.bulk_cost).toFixed(2)} {ing.purchase_currency}
                    </td>
                    <td className="px-6 py-4 font-mono text-neon-cyan">
                      {totalLyd.toFixed(2)} LYD
                    </td>
                    <td className="px-6 py-4 font-mono text-neon-green text-xs">
                      {costPerBase.toFixed(4)} LYD/{ing.base_unit}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(ing)}
                          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-neon-cyan transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(ing.id, ing.name)}
                          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-neon-red transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    {search ? 'No ingredients match your search' : 'No ingredients yet. Add your first one!'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-100">
                {editingId ? 'Edit Ingredient' : 'Add Ingredient'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Ingredient Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="neon-input"
                  placeholder="e.g., Matcha Powder"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Base Unit (what you measure servings in)
                </label>
                <select
                  value={form.base_unit}
                  onChange={(e) => setForm({ ...form, base_unit: e.target.value })}
                  className="neon-select"
                >
                  {BASE_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Bulk Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.bulk_qty}
                    onChange={(e) => setForm({ ...form, bulk_qty: e.target.value })}
                    className="neon-input font-mono"
                    placeholder="e.g., 1"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Bulk Unit
                  </label>
                  <select
                    value={form.bulk_unit}
                    onChange={(e) => setForm({ ...form, bulk_unit: e.target.value })}
                    className="neon-select"
                  >
                    {BULK_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Bulk Cost
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.bulk_cost}
                    onChange={(e) => setForm({ ...form, bulk_cost: e.target.value })}
                    className="neon-input font-mono"
                    placeholder="e.g., 50.00"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Purchase Currency
                  </label>
                  <select
                    value={form.purchase_currency}
                    onChange={(e) => setForm({ ...form, purchase_currency: e.target.value })}
                    className="neon-select"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live preview */}
              {form.bulk_qty && form.bulk_cost && (
                <div className="bg-dark-800 rounded-xl p-4 border border-neon-cyan/10">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Cost Preview</p>
                  <div className="space-y-1">
                    {form.purchase_currency !== 'LYD' && (
                      <p className="text-sm text-gray-400">
                        Total in LYD:{' '}
                        <span className="font-mono text-neon-cyan">
                          {(parseFloat(form.bulk_cost || 0) * (rates[form.purchase_currency] || 1)).toFixed(2)} LYD
                        </span>
                      </p>
                    )}
                    <p className="text-sm text-gray-400">
                      Per {form.base_unit}:{' '}
                      <span className="font-mono text-neon-green">
                        {form.bulk_qty > 0
                          ? calcCostPerBaseUnit(
                              parseFloat(form.bulk_qty),
                              form.bulk_unit,
                              parseFloat(form.bulk_cost),
                              form.purchase_currency,
                              rates
                            ).toFixed(4)
                          : '0.0000'}{' '}
                        LYD
                      </span>
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="neon-input"
                  placeholder="e.g., Sourced from Japan"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="neon-btn-green flex items-center gap-2 flex-1 justify-center">
                  <Save className="w-4 h-4" />
                  {editingId ? 'Update' : 'Add Ingredient'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-200 border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
