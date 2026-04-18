import { useState, useEffect, useRef } from 'react'
import { Package, Search, Upload, Plus, Camera, Globe, X, Check, AlertTriangle, Loader2, Grid, List, Archive, ExternalLink, ToggleLeft, ToggleRight, Tag } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { usePermission } from '../../lib/usePermission'
import {
  getStock,
  getIngredientsForCost,
  createIngredientForCost,
  updateStockQty,
  upsertStock,
  uploadIngredientImage,
  updateIngredientSupplier,
  extractInventoryFromFile,
  checkWebPrice,
  supabase,
} from '../../lib/supabase'
import { getApiKey } from '../../lib/claudeClient'
import toast from 'react-hot-toast'

// ── Claude AI calls (direct from browser) ──────────────────
async function classifyTier(name, category, unit) {
  const apiKey = getApiKey()
  if (!apiKey) return null
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `Given inventory item: name='${name}', category='${category}', unit='${unit}' — classify as: critical, operations, or retail. Reply one word.`,
        }],
      }),
    })
    const data = await response.json()
    const text = data.content?.[0]?.text?.trim().toLowerCase()
    if (['critical','operations','retail'].includes(text)) return text
  } catch {}
  return null
}

async function estimateDailyUsage(name, category, unit, stock) {
  const apiKey = getApiKey()
  if (!apiKey) return null
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `Estimate daily usage for a café: name='${name}', category='${category}', unit='${unit}', stock=${stock}. Reply only a number.`,
        }],
      }),
    })
    const data = await response.json()
    const num = parseFloat(data.content?.[0]?.text?.trim())
    if (!isNaN(num) && num > 0) return num
  } catch {}
  return null
}

// Session cache for AI results
const tierCache = {}
const usageCache = {}

function TierBadge({ tier, aiSuggested, onClick }) {
  const config = {
    critical: { label: 'Critical', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
    operations: { label: 'Operations', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    retail: { label: 'Retail', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  }
  const c = config[tier] || config.operations
  return (
    <button
      onClick={onClick}
      title={aiSuggested ? 'AI suggested — click to override' : 'Click to change tier'}
      className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${c.cls} hover:opacity-80 flex items-center gap-1`}
    >
      {c.label}
      {aiSuggested && <span className="text-[9px] opacity-60">AI</span>}
    </button>
  )
}

function DaysToStockout({ days }) {
  if (days === null || days === undefined) return <span className="px-2 py-0.5 rounded-full text-xs bg-noch-border text-noch-muted border border-noch-border">N/A</span>
  if (days <= 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/30">OUT</span>
  if (days < 7) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/30">{days}d</span>
  if (days <= 14) return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30">{days}d</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/30">{days}d</span>
}

function StatusBadge({ qty, threshold }) {
  if (qty <= 0) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">OUT</span>
  if (threshold > 0 && qty <= threshold) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">LOW</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/30">OK</span>
}

const TIERS = ['all', 'critical', 'operations', 'retail', 'archived']

export default function StockManager() {
  const { profile } = useAuth()
  const can = usePermission()
  const isOwner = profile?.role === 'owner'
  const canManage = isOwner || can('inventory', 'manage')
  const canUpdate = isOwner || can('inventory', 'stock_update') || can('inventory', 'manage')
  const fileInputRef = useRef(null)

  const [stock, setStock] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTier, setSelectedTier] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState('grid') // grid | table

  // AI tier state (per-item session cache)
  const [aiTiers, setAiTiers] = useState({})
  const [aiUsage, setAiUsage] = useState({})
  const [loadingTier, setLoadingTier] = useState({})

  // Update stock modal
  const [updateModal, setUpdateModal] = useState(null)
  const [updateQty, setUpdateQty] = useState('')
  const [updateType, setUpdateType] = useState('restock')
  const [updateNotes, setUpdateNotes] = useState('')
  const [updating, setUpdating] = useState(false)

  // Add ingredient modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [newIngredient, setNewIngredient] = useState({ name: '', base_unit: 'g', bulk_qty: '', bulk_unit: 'kg', bulk_cost: '' })
  const [adding, setAdding] = useState(false)

  // Delivery note
  const [deliveryItems, setDeliveryItems] = useState(null)
  const [extracting, setExtracting] = useState(false)

  // Image upload
  const [uploadingImage, setUploadingImage] = useState(null)

  // Tier edit modal
  const [tierModal, setTierModal] = useState(null) // { id, currentTier }

  // Web price
  const [priceResult, setPriceResult] = useState(null)
  const [checkingPrice, setCheckingPrice] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [stockData, ingredientData] = await Promise.all([getStock(), getIngredientsForCost()])
      // Fetch suppliers
      const { data: suppData } = await supabase.from('suppliers').select('id, name')
      setStock(stockData || [])
      setIngredients(ingredientData || [])
      setSuppliers(suppData || [])
    } catch {
      toast.error('Failed to load stock data')
    } finally {
      setLoading(false)
    }
  }

  // Merge stock + ingredients
  const mergedItems = ingredients.map(ing => {
    const s = stock.find(st => st.ingredient_id === ing.id)
    return {
      ...ing,
      qty_available: s?.qty_available ?? 0,
      unit: s?.unit || ing.base_unit,
      min_threshold: s?.min_threshold ?? 0,
      hasStock: !!s,
      tier: ing.tier || 'operations',
      archived: ing.archived || false,
      discontinued: ing.discontinued || false,
      restock_when_empty: ing.restock_when_empty !== false,
    }
  })

  // Sort: critical first
  const sortedItems = [...mergedItems].sort((a, b) => {
    const tierOrder = { critical: 0, operations: 1, retail: 2 }
    return (tierOrder[a.tier] ?? 1) - (tierOrder[b.tier] ?? 1)
  })

  const filtered = sortedItems.filter(item => {
    if (item.archived && selectedTier !== 'archived') return false
    if (!item.archived && selectedTier === 'archived') return false
    if (selectedTier !== 'all' && selectedTier !== 'archived' && item.tier !== selectedTier) return false
    const matchesSearch = item.name?.toLowerCase().includes(search.toLowerCase()) || item.supplier_name?.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  function calcDaysToStockout(item) {
    const qty = parseFloat(item.qty_available) || 0
    if (qty <= 0) return 0
    // Priority: manual > AI estimate
    const usage = item.daily_usage_manual || aiUsage[item.id]
    if (!usage || usage <= 0) return null
    return Math.round(qty / usage)
  }

  async function handleAiTier(item) {
    if (tierCache[item.id]) {
      setAiTiers(prev => ({ ...prev, [item.id]: tierCache[item.id] }))
      return
    }
    setLoadingTier(prev => ({ ...prev, [item.id]: true }))
    const tier = await classifyTier(item.name, item.category, item.base_unit)
    if (tier) {
      tierCache[item.id] = tier
      setAiTiers(prev => ({ ...prev, [item.id]: tier }))
    }
    setLoadingTier(prev => ({ ...prev, [item.id]: false }))
  }

  async function handleAiUsage(item) {
    if (usageCache[item.id]) {
      setAiUsage(prev => ({ ...prev, [item.id]: usageCache[item.id] }))
      return
    }
    const usage = await estimateDailyUsage(item.name, item.category, item.base_unit, item.qty_available)
    if (usage) {
      usageCache[item.id] = usage
      setAiUsage(prev => ({ ...prev, [item.id]: usage }))
    }
  }

  // Load AI data for visible items (on first render)
  useEffect(() => {
    if (!ingredients.length) return
    const apiKey = getApiKey()
    if (!apiKey) return
    ingredients.slice(0, 20).forEach(item => {
      if (!tierCache[item.id]) handleAiTier(item)
      if (!usageCache[item.id]) handleAiUsage(item)
    })
  }, [ingredients.length])

  async function saveTier(ingredientId, tier) {
    try {
      await supabase.from('ingredients').update({ tier }).eq('id', ingredientId)
      setIngredients(prev => prev.map(i => i.id === ingredientId ? { ...i, tier } : i))
      toast.success(`Tier set to ${tier}`)
    } catch { toast.error('Failed to update tier') }
    setTierModal(null)
  }

  async function toggleArchive(item) {
    try {
      await supabase.from('ingredients').update({ archived: !item.archived }).eq('id', item.id)
      setIngredients(prev => prev.map(i => i.id === item.id ? { ...i, archived: !item.archived } : i))
      toast.success(item.archived ? 'Unarchived' : 'Archived')
    } catch { toast.error('Failed') }
  }

  async function toggleDiscontinue(item) {
    try {
      await supabase.from('ingredients').update({ discontinued: !item.discontinued }).eq('id', item.id)
      setIngredients(prev => prev.map(i => i.id === item.id ? { ...i, discontinued: !item.discontinued } : i))
      toast.success(item.discontinued ? 'Marked active' : 'Marked discontinued')
    } catch { toast.error('Failed') }
  }

  async function toggleRestock(item) {
    try {
      await supabase.from('ingredients').update({ restock_when_empty: !item.restock_when_empty }).eq('id', item.id)
      setIngredients(prev => prev.map(i => i.id === item.id ? { ...i, restock_when_empty: !item.restock_when_empty } : i))
    } catch { toast.error('Failed') }
  }

  async function handleUpdateStock() {
    if (!updateModal || !updateQty) return
    setUpdating(true)
    try {
      const newQty = parseFloat(updateQty)
      if (isNaN(newQty) || newQty < 0) { toast.error('Invalid quantity'); return }
      if (!updateModal.hasStock) {
        await upsertStock(updateModal.ingredientId, newQty, updateModal.unit, 0)
      } else {
        await updateStockQty(updateModal.ingredientId, newQty, updateType, updateNotes || undefined)
      }
      toast.success('Stock updated')
      setUpdateModal(null)
      setUpdateQty('')
      setUpdateType('restock')
      setUpdateNotes('')
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setUpdating(false)
    }
  }

  async function handleAddIngredient() {
    if (!newIngredient.name) return
    setAdding(true)
    try {
      await createIngredientForCost({
        name: newIngredient.name,
        base_unit: newIngredient.base_unit,
        bulk_qty: newIngredient.bulk_qty ? parseFloat(newIngredient.bulk_qty) : null,
        bulk_unit: newIngredient.bulk_unit,
        bulk_cost: newIngredient.bulk_cost ? parseFloat(newIngredient.bulk_cost) : null,
      })
      toast.success('Ingredient added')
      setShowAddModal(false)
      setNewIngredient({ name: '', base_unit: 'g', bulk_qty: '', bulk_unit: 'kg', bulk_cost: '' })
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleDeliveryUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1]
          const result = await extractInventoryFromFile(base64, file.type, ingredients.map(i => ({ id: i.id, name: i.name })))
          if (result.success && result.items?.length) {
            setDeliveryItems(result.items)
            toast.success(`Extracted ${result.items.length} items`)
          } else {
            toast.error('No items found in document')
          }
        } catch (err) {
          toast.error(err.message || 'Failed to extract')
        } finally {
          setExtracting(false)
        }
      }
      reader.readAsDataURL(file)
    } catch {
      toast.error('Failed to read file')
      setExtracting(false)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleApplyDelivery() {
    if (!deliveryItems?.length) return
    let applied = 0
    for (const item of deliveryItems) {
      if (!item.matched_ingredient_id) continue
      try {
        const existing = stock.find(s => s.ingredient_id === item.matched_ingredient_id)
        const currentQty = existing ? parseFloat(existing.qty_available) : 0
        const newQty = currentQty + parseFloat(item.quantity)
        if (existing) {
          await updateStockQty(item.matched_ingredient_id, newQty, 'restock', `Delivery: ${item.raw_name}`)
        } else {
          await upsertStock(item.matched_ingredient_id, parseFloat(item.quantity), item.unit, 0)
        }
        applied++
      } catch {}
    }
    toast.success(`Applied ${applied} items`)
    setDeliveryItems(null)
    await loadData()
  }

  async function handleImageUpload(ingredientId, e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(ingredientId)
    try {
      await uploadIngredientImage(ingredientId, file)
      toast.success('Image uploaded')
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setUploadingImage(null)
    }
  }

  function handleWebPrice(item) {
    if (item.supplier_url) {
      window.open(item.supplier_url, '_blank')
    } else {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(item.name + ' price buy')}`, '_blank')
    }
  }

  async function handleCheckAIPrice(item) {
    setCheckingPrice(item.id)
    setPriceResult(null)
    try {
      const result = await checkWebPrice(item.name, item.base_unit)
      setPriceResult({ ingredientId: item.id, data: result })
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setCheckingPrice(null)
    }
  }

  const tierLabel = (t) => t === 'all' ? `All (${mergedItems.filter(i => !i.archived).length})`
    : t === 'archived' ? `Archived (${mergedItems.filter(i => i.archived).length})`
    : `${t.charAt(0).toUpperCase() + t.slice(1)} (${mergedItems.filter(i => !i.archived && i.tier === t).length})`

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Stock Manager</h1>
            <p className="text-noch-muted text-sm mt-1">{filtered.length} items</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleDeliveryUpload} />
            {canUpdate && (
              <button onClick={() => fileInputRef.current?.click()} disabled={extracting} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-3 py-2 text-sm font-medium hover:bg-noch-green/20 flex items-center gap-2 disabled:opacity-50">
                {extracting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {extracting ? 'Extracting...' : 'Upload Delivery'}
              </button>
            )}
            {canManage && (
              <button onClick={() => setShowAddModal(true)} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-3 py-2 text-sm font-medium hover:bg-noch-green/20 flex items-center gap-2">
                <Plus size={16} /> Add Item
              </button>
            )}
            {/* View toggle */}
            <div className="flex rounded-lg border border-noch-border overflow-hidden">
              <button onClick={() => setViewMode('grid')} className={`px-3 py-2 transition-colors ${viewMode === 'grid' ? 'bg-noch-green/10 text-noch-green' : 'text-noch-muted hover:text-white'}`}><Grid size={16} /></button>
              <button onClick={() => setViewMode('table')} className={`px-3 py-2 transition-colors ${viewMode === 'table' ? 'bg-noch-green/10 text-noch-green' : 'text-noch-muted hover:text-white'}`}><List size={16} /></button>
            </div>
          </div>
        </div>

        {/* Tier filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TIERS.map(tier => (
            <button key={tier} onClick={() => setSelectedTier(tier)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                selectedTier === tier
                  ? 'bg-noch-green/20 text-noch-green border border-noch-green/50'
                  : 'bg-noch-card text-noch-muted border border-noch-border hover:text-white'
              }`}
            >
              {tierLabel(tier)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-noch-card border border-noch-border rounded-lg text-white text-sm placeholder:text-noch-muted focus:outline-none focus:border-noch-green/50"
          />
        </div>

        {/* Delivery note preview */}
        {deliveryItems && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">Extracted Items ({deliveryItems.length})</h2>
                <button onClick={() => setDeliveryItems(null)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-noch-muted text-xs border-b border-noch-border"><th className="text-left py-2 px-2">Item</th><th className="text-left py-2 px-2">Qty</th><th className="text-left py-2 px-2">Unit</th><th className="text-left py-2 px-2">Match</th><th className="text-left py-2 px-2">Conf.</th></tr></thead>
                  <tbody>
                    {deliveryItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-noch-border/50">
                        <td className="py-2 px-2 text-white">{item.raw_name}</td>
                        <td className="py-2 px-2 text-white">{item.quantity}</td>
                        <td className="py-2 px-2 text-noch-muted">{item.unit}</td>
                        <td className="py-2 px-2">
                          <select value={item.matched_ingredient_id || ''} onChange={e => { const updated = [...deliveryItems]; updated[idx] = { ...updated[idx], matched_ingredient_id: e.target.value }; setDeliveryItems(updated) }}
                            className="w-full px-2 py-1 bg-noch-dark border border-noch-border rounded text-white text-xs">
                            <option value="">— No match —</option>
                            {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          {item.confidence != null && <span className={`text-xs ${item.confidence >= 0.7 ? 'text-green-400' : item.confidence >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>{Math.round(item.confidence * 100)}%</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setDeliveryItems(null)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button onClick={handleApplyDelivery} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 flex items-center gap-2"><Check size={16} /> Apply All</button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-noch-green" size={24} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-noch-muted"><Package size={40} className="mx-auto mb-3 opacity-50" /><p>No items found</p></div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => {
              const displayTier = item.tier || aiTiers[item.id] || 'operations'
              const aiSuggested = !item.tier && !!aiTiers[item.id]
              const days = calcDaysToStockout(item)
              const supplierName = item.supplier_id ? suppliers.find(s => s.id === item.supplier_id)?.name : item.supplier_name

              return (
                <div key={item.id} className={`bg-noch-card border rounded-xl p-4 space-y-3 ${item.archived ? 'opacity-60 border-noch-border/50' : 'border-noch-border'}`}>
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 relative group">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-noch-green/10 flex items-center justify-center text-noch-green font-bold text-sm">
                          {item.name?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      {canManage && (
                        <>
                          <input type="file" accept="image/*" className="hidden" id={`img-${item.id}`} onChange={e => handleImageUpload(item.id, e)} />
                          <label htmlFor={`img-${item.id}`} className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                            {uploadingImage === item.id ? <Loader2 size={14} className="animate-spin text-white" /> : <Camera size={14} className="text-white" />}
                          </label>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="text-white font-medium text-sm truncate">{item.name}</h3>
                        {item.discontinued && <span className="text-[9px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded">DISC</span>}
                      </div>
                      {supplierName && <p className="text-noch-muted text-xs truncate">{supplierName}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <TierBadge tier={displayTier} aiSuggested={aiSuggested} onClick={() => canManage && setTierModal({ id: item.id, currentTier: displayTier })} />
                      <StatusBadge qty={item.qty_available} threshold={item.min_threshold} />
                    </div>
                  </div>

                  {/* Stock qty */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-white text-lg font-semibold">{item.qty_available}</span>
                    <span className="text-noch-muted text-xs">{item.unit}</span>
                    {item.min_threshold > 0 && <span className="text-noch-muted text-xs ml-auto">min: {item.min_threshold}</span>}
                    <div className="ml-auto"><DaysToStockout days={days} /></div>
                  </div>

                  {/* Cost (owner) */}
                  {canManage && item.bulk_cost && (
                    <div className="text-xs text-noch-muted">Cost: {item.bulk_cost} LYD / {item.bulk_qty} {item.bulk_unit}</div>
                  )}

                  {/* Web price result */}
                  {priceResult?.ingredientId === item.id && priceResult.data && (
                    <div className="bg-noch-dark rounded-lg p-2 text-xs space-y-1 border border-noch-border">
                      <div className="flex items-center justify-between">
                        <span className="text-noch-muted">Web Price</span>
                        <span className={`font-medium ${priceResult.data.confidence === 'high' ? 'text-green-400' : priceResult.data.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'}`}>{priceResult.data.confidence}</span>
                      </div>
                      {priceResult.data.estimated_price_lyd != null && <p className="text-white font-medium">{priceResult.data.estimated_price_lyd} LYD</p>}
                      <button onClick={() => setPriceResult(null)} className="text-noch-muted hover:text-white text-xs underline">dismiss</button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {canUpdate && (
                      <button onClick={() => setUpdateModal({ ingredientId: item.id, name: item.name, currentQty: item.qty_available, unit: item.unit, hasStock: item.hasStock })}
                        className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-noch-green/20">
                        Update Stock
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button onClick={() => handleWebPrice(item)} className="text-noch-muted hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-noch-border flex items-center gap-1">
                          <Globe size={11} /> Web Price
                        </button>
                        <button onClick={() => toggleArchive(item)} className="text-noch-muted hover:text-amber-400 text-xs px-2 py-1.5 rounded-lg hover:bg-noch-border flex items-center gap-1">
                          <Archive size={11} /> {item.archived ? 'Unarchive' : 'Archive'}
                        </button>
                        {/* Restock toggle */}
                        <button onClick={() => toggleRestock(item)} title="Toggle auto-restock" className="text-noch-muted hover:text-white">
                          {item.restock_when_empty ? <ToggleRight size={16} className="text-noch-green" /> : <ToggleLeft size={16} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Table view */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-noch-muted text-xs border-b border-noch-border">
                  <th className="text-left py-2 px-3">Name</th>
                  <th className="text-left py-2 px-3">Tier</th>
                  <th className="text-right py-2 px-3">Stock</th>
                  <th className="text-right py-2 px-3">Min</th>
                  <th className="text-left py-2 px-3">Days Left</th>
                  <th className="text-left py-2 px-3">Supplier</th>
                  <th className="text-center py-2 px-3">Restock</th>
                  <th className="text-left py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const displayTier = item.tier || aiTiers[item.id] || 'operations'
                  const aiSuggested = !item.tier && !!aiTiers[item.id]
                  const days = calcDaysToStockout(item)
                  const supplierName = item.supplier_id ? suppliers.find(s => s.id === item.supplier_id)?.name : item.supplier_name
                  return (
                    <tr key={item.id} className={`border-b border-noch-border/50 hover:bg-noch-card/50 ${item.archived ? 'opacity-60' : ''}`}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          {item.image_url ? <img src={item.image_url} alt="" className="w-7 h-7 rounded object-cover" /> : <div className="w-7 h-7 rounded bg-noch-green/10 flex items-center justify-center text-noch-green text-xs font-bold">{item.name?.[0]}</div>}
                          <span className="text-white font-medium">{item.name}</span>
                          {item.discontinued && <span className="text-[9px] px-1 bg-red-500/10 text-red-400 rounded">DISC</span>}
                        </div>
                      </td>
                      <td className="py-2 px-3"><TierBadge tier={displayTier} aiSuggested={aiSuggested} onClick={() => canManage && setTierModal({ id: item.id, currentTier: displayTier })} /></td>
                      <td className="py-2 px-3 text-right"><span className="text-white font-semibold">{item.qty_available}</span> <span className="text-noch-muted text-xs">{item.unit}</span></td>
                      <td className="py-2 px-3 text-right text-noch-muted">{item.min_threshold || '—'}</td>
                      <td className="py-2 px-3"><DaysToStockout days={days} /></td>
                      <td className="py-2 px-3 text-noch-muted text-xs">{supplierName || '—'}</td>
                      <td className="py-2 px-3 text-center">
                        <button onClick={() => canManage && toggleRestock(item)} className="text-noch-muted hover:text-white">
                          {item.restock_when_empty ? <ToggleRight size={16} className="text-noch-green" /> : <ToggleLeft size={16} />}
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          {canUpdate && <button onClick={() => setUpdateModal({ ingredientId: item.id, name: item.name, currentQty: item.qty_available, unit: item.unit, hasStock: item.hasStock })} className="text-noch-green hover:text-green-300 text-xs px-2 py-1 rounded hover:bg-noch-card">Update</button>}
                          {canManage && <button onClick={() => toggleArchive(item)} className="text-noch-muted hover:text-amber-400 text-xs px-2 py-1 rounded hover:bg-noch-card"><Archive size={12} /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Update Stock Modal */}
        {updateModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Update Stock</h2>
                <button onClick={() => setUpdateModal(null)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <p className="text-noch-muted text-sm mb-4">{updateModal.name} — current: {updateModal.currentQty} {updateModal.unit}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">New Quantity</label>
                  <input type="number" step="0.01" value={updateQty} onChange={e => setUpdateQty(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" autoFocus />
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Change Type</label>
                  <select value={updateType} onChange={e => setUpdateType(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50">
                    <option value="restock">Restock</option>
                    <option value="usage">Usage</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Notes (optional)</label>
                  <input type="text" value={updateNotes} onChange={e => setUpdateNotes(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setUpdateModal(null)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button onClick={handleUpdateStock} disabled={updating || !updateQty} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 disabled:opacity-50 flex items-center gap-2">
                  {updating && <Loader2 size={14} className="animate-spin" />} Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Ingredient Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Add Ingredient</h2>
                <button onClick={() => setShowAddModal(false)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div><label className="text-noch-muted text-xs mb-1 block">Name</label>
                  <input type="text" value={newIngredient.name} onChange={e => setNewIngredient({ ...newIngredient, name: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-noch-muted text-xs mb-1 block">Base Unit</label>
                    <input type="text" value={newIngredient.base_unit} onChange={e => setNewIngredient({ ...newIngredient, base_unit: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="g, ml, etc." />
                  </div>
                  <div><label className="text-noch-muted text-xs mb-1 block">Bulk Unit</label>
                    <input type="text" value={newIngredient.bulk_unit} onChange={e => setNewIngredient({ ...newIngredient, bulk_unit: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="kg, L, etc." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-noch-muted text-xs mb-1 block">Bulk Qty</label>
                    <input type="number" value={newIngredient.bulk_qty} onChange={e => setNewIngredient({ ...newIngredient, bulk_qty: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" />
                  </div>
                  <div><label className="text-noch-muted text-xs mb-1 block">Bulk Cost (LYD)</label>
                    <input type="number" value={newIngredient.bulk_cost} onChange={e => setNewIngredient({ ...newIngredient, bulk_cost: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button onClick={handleAddIngredient} disabled={adding || !newIngredient.name} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 disabled:opacity-50 flex items-center gap-2">
                  {adding && <Loader2 size={14} className="animate-spin" />} Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tier Override Modal */}
        {tierModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-xs">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2"><Tag size={16} className="text-noch-green" /> Set Tier</h2>
              <div className="flex flex-col gap-2">
                {['critical','operations','retail'].map(t => (
                  <button key={t} onClick={() => saveTier(tierModal.id, t)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium text-left flex items-center gap-3 transition-colors border ${tierModal.currentTier === t ? 'border-noch-green/50 bg-noch-green/10 text-noch-green' : 'border-noch-border text-noch-muted hover:text-white hover:border-noch-green/30'}`}>
                    <span className={`w-2 h-2 rounded-full ${t === 'critical' ? 'bg-red-400' : t === 'operations' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                    {tierModal.currentTier === t && <span className="ml-auto text-xs opacity-60">current</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => setTierModal(null)} className="w-full mt-4 text-sm text-noch-muted hover:text-white">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
