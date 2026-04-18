import { useEffect, useState } from 'react'
import {
  getStock, getIngredients, upsertStock, updateStockQty, removeStockItem, getStockLogs
} from '../../../lib/supabase'
import {
  Package, Plus, AlertTriangle, ArrowUpCircle, ArrowDownCircle,
  Settings2, Trash2, X, Save, History, Search
} from 'lucide-react'
import toast from 'react-hot-toast'

const STOCK_UNITS = ['kg', 'g', 'L', 'ml', 'piece']

export default function Stock() {
  const [stock, setStock] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(null) // stock item
  const [showLogs, setShowLogs] = useState(null) // ingredient_id
  const [logs, setLogs] = useState([])

  // Add form
  const [addForm, setAddForm] = useState({ ingredient_id: '', qty: '', unit: 'kg', min_threshold: '' })
  // Update form
  const [updateForm, setUpdateForm] = useState({ qty: '', type: 'restock', notes: '' })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const [s, ings] = await Promise.all([getStock(), getIngredients()])
      setStock(s)
      setIngredients(ings)
    } catch (err) {
      toast.error('Failed to load stock')
    } finally {
      setLoading(false)
    }
  }

  const trackedIngredientIds = stock.map((s) => s.ingredient_id)
  const untrackedIngredients = ingredients.filter((i) => !trackedIngredientIds.includes(i.id))

  async function handleAddStock(e) {
    e.preventDefault()
    try {
      await upsertStock(
        addForm.ingredient_id,
        parseFloat(addForm.qty) || 0,
        addForm.unit,
        parseFloat(addForm.min_threshold) || 0
      )
      toast.success('Item added to stock tracking')
      setShowAddModal(false)
      setAddForm({ ingredient_id: '', qty: '', unit: 'kg', min_threshold: '' })
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  function openUpdate(item) {
    setShowUpdateModal(item)
    setUpdateForm({ qty: item.qty_available, type: 'restock', notes: '' })
  }

  async function handleUpdate(e) {
    e.preventDefault()
    try {
      await updateStockQty(
        showUpdateModal.ingredient_id,
        parseFloat(updateForm.qty),
        updateForm.type,
        updateForm.notes || null
      )
      toast.success('Stock updated')
      setShowUpdateModal(null)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleRemove(item) {
    const name = item.ingredient?.name || 'this item'
    if (!confirm(`Remove "${name}" from stock tracking?`)) return
    try {
      await removeStockItem(item.ingredient_id)
      toast.success('Removed from tracking')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function openLogs(ingredientId) {
    setShowLogs(ingredientId)
    try {
      const l = await getStockLogs(ingredientId)
      setLogs(l)
    } catch (err) {
      toast.error('Failed to load logs')
    }
  }

  const filtered = stock.filter((s) =>
    (s.ingredient?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const lowStockItems = stock.filter(
    (s) => parseFloat(s.min_threshold) > 0 && parseFloat(s.qty_available) <= parseFloat(s.min_threshold)
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
          <h1 className="text-2xl font-bold text-gray-100">Stock Tracking</h1>
          <p className="text-gray-500 text-sm mt-1">{stock.length} items tracked</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="neon-btn flex items-center gap-2"
          disabled={untrackedIngredients.length === 0}
        >
          <Plus className="w-4 h-4" /> Track New Item
        </button>
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div className="bg-neon-red/5 border border-neon-red/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-neon-red flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-neon-red">Low Stock Alert</p>
            <p className="text-xs text-gray-400 mt-1">
              {lowStockItems.map((s) => s.ingredient?.name).join(', ')} — below minimum threshold
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="neon-input pl-11"
          placeholder="Search stock..."
        />
      </div>

      {/* Stock Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Item</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Available</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Min Threshold</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium">Status</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wider text-gray-400 font-medium w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const qty = parseFloat(item.qty_available)
                const threshold = parseFloat(item.min_threshold)
                const isLow = threshold > 0 && qty <= threshold
                const isEmpty = qty <= 0

                return (
                  <tr key={item.id} className="table-row">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                          isLow ? 'bg-neon-red/10 border-neon-red/20' : 'bg-neon-green/10 border-neon-green/20'
                        }`}>
                          <Package className={`w-4 h-4 ${isLow ? 'text-neon-red' : 'text-neon-green'}`} />
                        </div>
                        <span className="font-medium text-gray-200">{item.ingredient?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono">
                      <span className={isEmpty ? 'text-neon-red' : isLow ? 'text-neon-amber' : 'text-gray-300'}>
                        {qty} {item.unit}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-400">
                      {threshold > 0 ? `${threshold} ${item.unit}` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      {isEmpty ? (
                        <span className="badge-red">OUT OF STOCK</span>
                      ) : isLow ? (
                        <span className="badge-amber">LOW</span>
                      ) : (
                        <span className="badge-green">OK</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openUpdate(item)}
                          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-neon-cyan transition-colors"
                          title="Update quantity"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openLogs(item.ingredient_id)}
                          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-neon-purple transition-colors"
                          title="View logs"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemove(item)}
                          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-neon-red transition-colors"
                          title="Remove from tracking"
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
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    {search ? 'No items match your search' : 'No items being tracked. Add your first one!'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add to Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-100">Track New Item</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddStock} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Ingredient</label>
                <select
                  value={addForm.ingredient_id}
                  onChange={(e) => setAddForm({ ...addForm, ingredient_id: e.target.value })}
                  className="neon-select"
                  required
                >
                  <option value="">Select ingredient...</option>
                  {untrackedIngredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>{ing.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Current Qty</label>
                  <input
                    type="number"
                    step="any"
                    value={addForm.qty}
                    onChange={(e) => setAddForm({ ...addForm, qty: e.target.value })}
                    className="neon-input font-mono"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Unit</label>
                  <select
                    value={addForm.unit}
                    onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
                    className="neon-select"
                  >
                    {STOCK_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Min Threshold (alert when below)
                </label>
                <input
                  type="number"
                  step="any"
                  value={addForm.min_threshold}
                  onChange={(e) => setAddForm({ ...addForm, min_threshold: e.target.value })}
                  className="neon-input font-mono"
                  placeholder="0 (no alert)"
                />
              </div>
              <button type="submit" className="neon-btn-green w-full flex items-center justify-center gap-2 py-3">
                <Save className="w-4 h-4" /> Add to Tracking
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Update Stock Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-100">
                Update: {showUpdateModal.ingredient?.name}
              </h2>
              <button onClick={() => setShowUpdateModal(null)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Current: <span className="font-mono text-neon-cyan">{showUpdateModal.qty_available} {showUpdateModal.unit}</span>
            </p>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">New Quantity</label>
                <input
                  type="number"
                  step="any"
                  value={updateForm.qty}
                  onChange={(e) => setUpdateForm({ ...updateForm, qty: e.target.value })}
                  className="neon-input font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Change Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'restock', label: 'Restock', icon: ArrowUpCircle, color: 'green' },
                    { value: 'usage', label: 'Usage', icon: ArrowDownCircle, color: 'amber' },
                    { value: 'adjustment', label: 'Adjust', icon: Settings2, color: 'cyan' },
                  ].map(({ value, label, icon: Icon, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setUpdateForm({ ...updateForm, type: value })}
                      className={`p-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition-all ${
                        updateForm.type === value
                          ? `bg-neon-${color}/10 border-neon-${color}/30 text-neon-${color}`
                          : 'border-white/10 text-gray-400 hover:border-white/20'
                      }`}
                      style={updateForm.type === value ? {
                        backgroundColor: color === 'green' ? 'rgba(0,255,136,0.1)' :
                          color === 'amber' ? 'rgba(255,170,0,0.1)' : 'rgba(0,240,255,0.1)',
                        borderColor: color === 'green' ? 'rgba(0,255,136,0.3)' :
                          color === 'amber' ? 'rgba(255,170,0,0.3)' : 'rgba(0,240,255,0.3)',
                        color: color === 'green' ? '#00ff88' :
                          color === 'amber' ? '#ffaa00' : '#00f0ff',
                      } : {}}
                    >
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Notes (optional)</label>
                <input
                  type="text"
                  value={updateForm.notes}
                  onChange={(e) => setUpdateForm({ ...updateForm, notes: e.target.value })}
                  className="neon-input"
                  placeholder="e.g., Restocked from supplier"
                />
              </div>
              <button type="submit" className="neon-btn-green w-full flex items-center justify-center gap-2 py-3">
                <Save className="w-4 h-4" /> Update Stock
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-lg animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-100">Stock History</h2>
              <button onClick={() => setShowLogs(null)} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            {logs.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No history yet</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                    {log.type === 'restock' ? (
                      <ArrowUpCircle className="w-4 h-4 text-neon-green flex-shrink-0" />
                    ) : log.type === 'usage' ? (
                      <ArrowDownCircle className="w-4 h-4 text-neon-amber flex-shrink-0" />
                    ) : (
                      <Settings2 className="w-4 h-4 text-neon-cyan flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm ${
                          parseFloat(log.qty_change) >= 0 ? 'text-neon-green' : 'text-neon-red'
                        }`}>
                          {parseFloat(log.qty_change) >= 0 ? '+' : ''}{log.qty_change}
                        </span>
                        <span className="badge text-[10px] bg-white/5 text-gray-400 border border-white/10">
                          {log.type}
                        </span>
                      </div>
                      {log.notes && <p className="text-xs text-gray-500 mt-0.5 truncate">{log.notes}</p>}
                    </div>
                    <span className="text-xs text-gray-600">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
