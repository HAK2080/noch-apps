import { useState, useEffect, useRef } from 'react'
import { Package, Search, Upload, Plus, Camera, Globe, X, Check, Loader2, Wrench,
  ArrowRightLeft, Sparkles, LayoutGrid, List, Archive, ArchiveRestore } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
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
import toast from 'react-hot-toast'

// ── Constants ────────────────────────────────────────────────
const CATEGORY_ICONS = {
  coffee: '☕', matcha: '🍵', milk: '🥛', syrups: '🍯',
  tea: '🫖', boba: '🧋', pastries: '🍰', supplies: '📦',
  tools: '🔧', default: '🧴',
}

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', 'piece', 'box', 'packet', 'bottle', 'bag', 'can', 'jar']

// ── Helpers ──────────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return null
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function smartQty(qty, unit) {
  const n = parseFloat(qty) || 0
  if (unit === 'g' && n >= 1000) return { value: +(n / 1000).toFixed(3), unit: 'kg' }
  if (unit === 'ml' && n >= 1000) return { value: +(n / 1000).toFixed(2), unit: 'L' }
  return { value: n % 1 === 0 ? n : +n.toFixed(2), unit: unit || '' }
}

function StatusBadge({ qty, threshold }) {
  if (qty <= 0) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">OUT</span>
  if (threshold > 0 && qty <= threshold) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">LOW</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/30">OK</span>
}

function urgencyRank(item) {
  if (item.qty_available <= 0) return 2
  if (item.min_threshold > 0 && item.qty_available <= item.min_threshold) return 0
  return 1
}

export default function StockManager() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const fileInputRef = useRef(null)
  const classifyTimerRef = useRef(null)

  const [stock, setStock] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [activeTab, setActiveTab] = useState('stock')
  const [viewMode, setViewMode] = useState('grid')
  const [showArchived, setShowArchived] = useState(false)

  const [updateModal, setUpdateModal] = useState(null)
  const [updateQty, setUpdateQty] = useState('')
  const [updateUnit, setUpdateUnit] = useState('')
  const [updateType, setUpdateType] = useState('restock')
  const [updateNotes, setUpdateNotes] = useState('')
  const [updating, setUpdating] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [newIngredient, setNewIngredient] = useState({ name: '', base_unit: 'g', bulk_qty: '', bulk_unit: 'kg', bulk_cost: '', track_type: 'consumable' })
  const [adding, setAdding] = useState(false)
  const [classifying, setClassifying] = useState(false)

  const [deliveryItems, setDeliveryItems] = useState(null)
  const [extracting, setExtracting] = useState(false)

  const [supplierModal, setSupplierModal] = useState(null)
  const [supplierName, setSupplierName] = useState('')
  const [supplierContact, setSupplierContact] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  const [priceResult, setPriceResult] = useState(null)
  const [checkingPrice, setCheckingPrice] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [stockData, ingredientData] = await Promise.all([getStock(), getIngredientsForCost()])
      setStock(stockData || [])
      setIngredients(ingredientData || [])
    } catch { toast.error('Failed to load stock data') }
    finally { setLoading(false) }
  }

  // ── AI classification ────────────────────────────────────────
  async function classifyIngredient(name) {
    if (!name || name.length < 3) return
    setClassifying(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 10,
          messages: [{ role: 'user', content: `Classify this cafe inventory item as exactly "consumable" or "equipment": "${name}". One word only.` }],
        }),
      })
      const data = await res.json()
      const type = data.content?.[0]?.text?.toLowerCase().includes('equipment') ? 'equipment' : 'consumable'
      setNewIngredient(prev => ({ ...prev, track_type: type }))
    } catch { /* silent */ }
    finally { setClassifying(false) }
  }

  function handleNameChange(name) {
    setNewIngredient(prev => ({ ...prev, name }))
    clearTimeout(classifyTimerRef.current)
    classifyTimerRef.current = setTimeout(() => classifyIngredient(name), 600)
  }

  // ── Data processing ──────────────────────────────────────────
  const mergedItems = ingredients.map(ing => {
    const s = stock.find(st => st.ingredient_id === ing.id)
    return {
      ...ing,
      qty_available: s?.qty_available ?? 0,
      unit: s?.unit || ing.base_unit,
      min_threshold: s?.min_threshold ?? 0,
      last_manual_count_at: s?.last_manual_count_at ?? null,
      hasStock: !!s,
    }
  })

  const tabItems = mergedItems
    .filter(item => activeTab === 'equipment' ? item.track_type === 'equipment' : item.track_type !== 'equipment')

  const activeItems = tabItems.filter(i => !i.archived)
  const archivedItems = tabItems.filter(i => i.archived)

  const sortedActive = [...activeItems].sort((a, b) => urgencyRank(a) - urgencyRank(b) || (a.name || '').localeCompare(b.name || ''))

  const displayItems = showArchived
    ? [...sortedActive, ...archivedItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''))]
    : sortedActive

  const filtered = displayItems.filter(item => {
    const matchSearch = item.name?.toLowerCase().includes(search.toLowerCase()) || item.supplier_name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory
    return matchSearch && matchCat
  })

  const categories = ['all', ...new Set(tabItems.map(i => i.category).filter(Boolean))].sort()

  // ── Handlers ─────────────────────────────────────────────────
  async function handleMoveTab(item) {
    const newType = item.track_type === 'equipment' ? 'consumable' : 'equipment'
    try {
      await supabase.from('ingredients').update({ track_type: newType }).eq('id', item.id)
      toast.success(`Moved to ${newType === 'equipment' ? 'Equipment' : 'Stock'}`)
      await loadData()
    } catch { toast.error('Failed to move item') }
  }

  async function handleArchive(item) {
    const next = !item.archived
    try {
      await supabase.from('ingredients').update({ archived: next }).eq('id', item.id)
      toast.success(next ? 'Item archived' : 'Item restored')
      await loadData()
    } catch { toast.error('Failed to update item') }
  }

  async function handleUpdateStock() {
    if (!updateModal || !updateQty) return
    setUpdating(true)
    try {
      const newQty = parseFloat(updateQty)
      if (isNaN(newQty) || newQty < 0) { toast.error('Invalid quantity'); return }
      const unitChanged = updateUnit && updateUnit !== updateModal.unit
      if (!updateModal.hasStock || unitChanged) {
        await upsertStock(updateModal.ingredientId, newQty, updateUnit || updateModal.unit, updateModal.min_threshold || 0)
        if (updateModal.hasStock) {
          await supabase.from('stock_logs').insert({
            ingredient_id: updateModal.ingredientId,
            qty_change: newQty - updateModal.currentQty,
            type: updateType,
            notes: updateNotes || (unitChanged ? `Unit changed to ${updateUnit}` : undefined),
          })
        }
      } else {
        await updateStockQty(updateModal.ingredientId, newQty, updateType, updateNotes || undefined, updateUnit || undefined)
      }
      toast.success('Stock updated')
      setUpdateModal(null); setUpdateQty(''); setUpdateUnit(''); setUpdateType('restock'); setUpdateNotes('')
      await loadData()
    } catch (err) { toast.error(err.message || 'Failed to update stock') }
    finally { setUpdating(false) }
  }

  async function handleAddIngredient() {
    if (!newIngredient.name) return
    setAdding(true)
    try {
      await createIngredientForCost({
        name: newIngredient.name, base_unit: newIngredient.base_unit,
        bulk_qty: newIngredient.bulk_qty ? parseFloat(newIngredient.bulk_qty) : null,
        bulk_unit: newIngredient.bulk_unit,
        bulk_cost: newIngredient.bulk_cost ? parseFloat(newIngredient.bulk_cost) : null,
        track_type: newIngredient.track_type,
      })
      toast.success('Item added')
      setShowAddModal(false)
      setNewIngredient({ name: '', base_unit: 'g', bulk_qty: '', bulk_unit: 'kg', bulk_cost: '', track_type: 'consumable' })
      await loadData()
    } catch (err) { toast.error(err.message || 'Failed to add item') }
    finally { setAdding(false) }
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
          if (result.success && result.items?.length) { setDeliveryItems(result.items); toast.success(`Extracted ${result.items.length} items`) }
          else toast.error('No items found in document')
        } catch (err) { toast.error(err.message || 'Failed to extract items') }
        finally { setExtracting(false) }
      }
      reader.readAsDataURL(file)
    } catch { toast.error('Failed to read file'); setExtracting(false) }
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
        if (existing) await updateStockQty(item.matched_ingredient_id, newQty, 'restock', `Delivery: ${item.raw_name}`)
        else await upsertStock(item.matched_ingredient_id, parseFloat(item.quantity), item.unit, 0)
        applied++
      } catch (err) { console.error('Failed to apply item:', item.raw_name, err) }
    }
    toast.success(`Applied ${applied} of ${deliveryItems.length} items`)
    setDeliveryItems(null); await loadData()
  }

  function updateDeliveryMatch(index, ingredientId) {
    const updated = [...deliveryItems]
    const ing = ingredients.find(i => i.id === ingredientId)
    updated[index] = { ...updated[index], matched_ingredient_id: ingredientId, matched_ingredient_name: ing?.name || '' }
    setDeliveryItems(updated)
  }

  async function handleImageUpload(ingredientId, e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(ingredientId)
    try { await uploadIngredientImage(ingredientId, file); toast.success('Image uploaded'); await loadData() }
    catch (err) { toast.error(err.message || 'Failed to upload image') }
    finally { setUploadingImage(null) }
  }

  async function handleSaveSupplier() {
    if (!supplierModal) return
    setSavingSupplier(true)
    try {
      await updateIngredientSupplier(supplierModal, { supplier_name: supplierName, supplier_contact: supplierContact })
      toast.success('Supplier updated'); setSupplierModal(null); await loadData()
    } catch (err) { toast.error(err.message || 'Failed to update supplier') }
    finally { setSavingSupplier(false) }
  }

  async function handleCheckPrice(ingredient) {
    setCheckingPrice(ingredient.id); setPriceResult(null)
    try { const result = await checkWebPrice(ingredient.name, ingredient.base_unit); setPriceResult({ ingredientId: ingredient.id, data: result }) }
    catch (err) { toast.error(err.message || 'Failed to check price') }
    finally { setCheckingPrice(null) }
  }

  function openUpdateModal(item, isCount = false) {
    const { value } = smartQty(item.qty_available, item.unit)
    setUpdateModal({ ingredientId: item.id, name: item.name, currentQty: item.qty_available, unit: item.unit, min_threshold: item.min_threshold, hasStock: item.hasStock })
    setUpdateUnit(item.unit)
    if (isCount) { setUpdateType('manual_count'); setUpdateQty(String(value)) }
    else { setUpdateType('restock'); setUpdateQty('') }
  }

  // ── Card item rendering ───────────────────────────────────────
  function ItemCard({ item }) {
    const { value: displayQty, unit: displayUnit } = smartQty(item.qty_available, item.unit)
    const icon = CATEGORY_ICONS[item.category] || CATEGORY_ICONS.default
    const isArchived = item.archived

    return (
      <div className={`bg-noch-card border rounded-xl p-4 space-y-3 transition-opacity ${isArchived ? 'opacity-40 border-noch-border/40' : 'border-noch-border'}`}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 relative group">
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-noch-green/10 flex items-center justify-center text-lg">
                {icon}
              </div>
            )}
            {isOwner && (
              <>
                <input type="file" accept="image/*" className="hidden" id={`img-${item.id}`} onChange={e => handleImageUpload(item.id, e)} />
                <label htmlFor={`img-${item.id}`} className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  {uploadingImage === item.id ? <Loader2 size={14} className="animate-spin text-white" /> : <Camera size={14} className="text-white" />}
                </label>
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-medium text-sm truncate ${isArchived ? 'line-through text-noch-muted' : 'text-white'}`}>{item.name}</h3>
            {item.supplier_name && <p className="text-noch-muted text-xs truncate">{item.supplier_name}</p>}
            {isArchived && <p className="text-noch-muted text-[10px]">Archived — not reordering</p>}
          </div>
          <StatusBadge qty={item.qty_available} threshold={item.min_threshold} />
        </div>

        <div className="flex items-baseline gap-1">
          <span className="text-white text-lg font-semibold">{displayQty}</span>
          <span className="text-noch-muted text-xs">{displayUnit}</span>
          {item.unit !== displayUnit && <span className="text-noch-muted text-[10px] ml-1 opacity-60">({item.qty_available} {item.unit})</span>}
          {item.min_threshold > 0 && <span className="text-noch-muted text-xs ml-auto">min: {item.min_threshold} {item.unit}</span>}
        </div>

        <p className="text-noch-muted text-xs">
          {item.last_manual_count_at ? `Counted ${relativeTime(item.last_manual_count_at)}` : <span className="opacity-50">Never manually counted</span>}
        </p>

        {isOwner && !!item.bulk_cost && (
          <div className="text-xs text-noch-muted">Cost: {item.bulk_cost} LYD / {item.bulk_qty} {item.bulk_unit}</div>
        )}

        {priceResult?.ingredientId === item.id && priceResult.data && (
          <div className="bg-noch-dark rounded-lg p-3 text-xs space-y-1 border border-noch-border">
            <div className="flex items-center justify-between">
              <span className="text-noch-muted">Web Price</span>
              <span className={`font-medium ${priceResult.data.confidence === 'high' ? 'text-green-400' : priceResult.data.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'}`}>{priceResult.data.confidence} confidence</span>
            </div>
            {priceResult.data.estimated_price_lyd != null && <p className="text-white font-medium">{priceResult.data.estimated_price_lyd} LYD</p>}
            {priceResult.data.notes && <p className="text-noch-muted">{priceResult.data.notes}</p>}
            <button onClick={() => setPriceResult(null)} className="text-noch-muted hover:text-white text-xs underline">dismiss</button>
          </div>
        )}

        {!isArchived && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => openUpdateModal(item)} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-noch-green/20 transition-colors">
              Update Stock
            </button>
            <button onClick={() => openUpdateModal(item, true)} className="border border-noch-border text-noch-muted rounded-lg px-3 py-1.5 text-xs font-medium hover:text-white hover:border-white/30 transition-colors">
              Count
            </button>
            {isOwner && (
              <>
                <button onClick={() => { setSupplierModal(item.id); setSupplierName(item.supplier_name || ''); setSupplierContact(item.supplier_contact || '') }} className="text-noch-muted hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-noch-border transition-colors">Supplier</button>
                <button onClick={() => handleCheckPrice(item)} disabled={checkingPrice === item.id} className="text-noch-muted hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-noch-border transition-colors flex items-center gap-1 disabled:opacity-50">
                  {checkingPrice === item.id ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />} Web Price
                </button>
                <button onClick={() => handleMoveTab(item)} className="text-noch-muted hover:text-blue-400 text-xs px-2 py-1.5 rounded-lg hover:bg-noch-border transition-colors flex items-center gap-1" title={item.track_type === 'equipment' ? 'Move to Stock' : 'Move to Equipment'}>
                  <ArrowRightLeft size={12} /> {item.track_type === 'equipment' ? 'To Stock' : 'To Equipment'}
                </button>
              </>
            )}
          </div>
        )}

        <button onClick={() => handleArchive(item)} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors w-full justify-center border ${isArchived ? 'border-noch-green/30 text-noch-green hover:bg-noch-green/10' : 'border-noch-border text-noch-muted hover:text-orange-400 hover:border-orange-500/30'}`}>
          {isArchived ? <><ArchiveRestore size={11} /> Restore</> : <><Archive size={11} /> Archive (no reorder)</>}
        </button>
      </div>
    )
  }

  function ItemRow({ item }) {
    const { value: displayQty, unit: displayUnit } = smartQty(item.qty_available, item.unit)
    const icon = CATEGORY_ICONS[item.category] || CATEGORY_ICONS.default
    const isArchived = item.archived

    return (
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-noch-border/50 hover:bg-noch-border/10 transition-colors ${isArchived ? 'opacity-40' : ''}`}>
        <span className="text-lg shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isArchived ? 'line-through text-noch-muted' : 'text-white'}`}>{item.name}</p>
          {item.supplier_name && <p className="text-noch-muted text-xs">{item.supplier_name}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-white text-sm font-semibold">{displayQty} <span className="text-noch-muted text-xs font-normal">{displayUnit}</span></p>
          {item.min_threshold > 0 && <p className="text-noch-muted text-[10px]">min {item.min_threshold} {item.unit}</p>}
        </div>
        <StatusBadge qty={item.qty_available} threshold={item.min_threshold} />
        {!isArchived && (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => openUpdateModal(item)} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-2.5 py-1 text-xs hover:bg-noch-green/20 transition-colors">Update</button>
            <button onClick={() => openUpdateModal(item, true)} className="border border-noch-border text-noch-muted rounded-lg px-2.5 py-1 text-xs hover:text-white transition-colors">Count</button>
          </div>
        )}
        {isArchived && (
          <button onClick={() => handleArchive(item)} className="text-noch-green text-xs px-2 py-1 border border-noch-green/30 rounded hover:bg-noch-green/10 transition-colors flex items-center gap-1 shrink-0">
            <ArchiveRestore size={11} /> Restore
          </button>
        )}
        {!isArchived && (
          <button onClick={() => handleArchive(item)} className="text-noch-muted hover:text-orange-400 p-1 rounded transition-colors shrink-0" title="Archive">
            <Archive size={13} />
          </button>
        )}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Stock Manager</h1>
            <p className="text-noch-muted text-sm mt-1">{filtered.length} items{archivedItems.length > 0 && ` · ${archivedItems.length} archived`}</p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'stock' && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleDeliveryUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={extracting} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-3 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors flex items-center gap-2 disabled:opacity-50">
                  {extracting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {extracting ? 'Extracting...' : 'Upload Delivery'}
                </button>
              </>
            )}
            {isOwner && (
              <button onClick={() => setShowAddModal(true)} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-3 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors flex items-center gap-2">
                <Plus size={16} /> Add Item
              </button>
            )}
            <div className="flex gap-1 bg-noch-card border border-noch-border rounded-lg p-1">
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-noch-green/15 text-noch-green' : 'text-noch-muted hover:text-white'}`}><LayoutGrid size={15} /></button>
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-noch-green/15 text-noch-green' : 'text-noch-muted hover:text-white'}`}><List size={15} /></button>
            </div>
          </div>
        </div>

        {/* Stock / Equipment tabs */}
        <div className="flex gap-1 bg-noch-card border border-noch-border rounded-xl p-1">
          <button onClick={() => { setActiveTab('stock'); setSelectedCategory('all') }} className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'stock' ? 'bg-noch-green/15 text-noch-green' : 'text-noch-muted hover:text-white'}`}>
            <Package size={15} /> Stock ({mergedItems.filter(i => i.track_type !== 'equipment').length})
          </button>
          <button onClick={() => { setActiveTab('equipment'); setSelectedCategory('all') }} className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'equipment' ? 'bg-blue-500/15 text-blue-400' : 'text-noch-muted hover:text-white'}`}>
            <Wrench size={15} /> Equipment ({mergedItems.filter(i => i.track_type === 'equipment').length})
          </button>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 items-center">
            {categories.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-noch-green/20 text-noch-green border border-noch-green/50' : 'bg-noch-card text-noch-muted border border-noch-border hover:text-white'}`}>
                {cat === 'all' ? `All (${tabItems.length})` : `${CATEGORY_ICONS[cat] || ''} ${cat}`}
              </button>
            ))}
            {archivedItems.length > 0 && (
              <button onClick={() => setShowArchived(v => !v)} className={`ml-auto px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap border transition-colors flex items-center gap-1.5 ${showArchived ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'text-noch-muted border-noch-border hover:text-white'}`}>
                <Archive size={11} /> {showArchived ? 'Hide archived' : `Show archived (${archivedItems.length})`}
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-noch-card border border-noch-border rounded-lg text-white text-sm placeholder:text-noch-muted focus:outline-none focus:border-noch-green/50" />
        </div>

        {/* Delivery note modal */}
        {deliveryItems && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">Extracted Items ({deliveryItems.length})</h2>
                <button onClick={() => setDeliveryItems(null)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-noch-muted text-xs border-b border-noch-border"><th className="text-left py-2 px-2">Item</th><th className="text-left py-2 px-2">Qty</th><th className="text-left py-2 px-2">Unit</th><th className="text-left py-2 px-2">Match</th><th className="text-left py-2 px-2">Confidence</th></tr></thead>
                  <tbody>
                    {deliveryItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-noch-border/50">
                        <td className="py-2 px-2 text-white">{item.raw_name}</td>
                        <td className="py-2 px-2 text-white">{item.quantity}</td>
                        <td className="py-2 px-2 text-noch-muted">{item.unit}</td>
                        <td className="py-2 px-2">
                          <select value={item.matched_ingredient_id || ''} onChange={e => updateDeliveryMatch(idx, e.target.value || null)} className="w-full px-2 py-1 bg-noch-dark border border-noch-border rounded text-white text-xs">
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
                <button onClick={handleApplyDelivery} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors flex items-center gap-2"><Check size={16} /> Apply All</button>
              </div>
            </div>
          </div>
        )}

        {/* Item grid / list */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-noch-green" size={24} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-noch-muted"><Package size={40} className="mx-auto mb-3 opacity-50" /><p>No items found</p></div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => <ItemCard key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
            {filtered.map(item => <ItemRow key={item.id} item={item} />)}
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
              <p className="text-noch-muted text-sm mb-4">{updateModal.name} — current: {smartQty(updateModal.currentQty, updateModal.unit).value} {smartQty(updateModal.currentQty, updateModal.unit).unit}</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">New Quantity</label>
                    <input type="number" step="0.01" value={updateQty} onChange={e => setUpdateQty(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="Enter quantity" autoFocus />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Unit</label>
                    <select value={updateUnit} onChange={e => setUpdateUnit(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50">
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Change Type</label>
                  <select value={updateType} onChange={e => setUpdateType(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50">
                    <option value="restock">Restock</option>
                    <option value="usage">Usage</option>
                    <option value="adjustment">Adjustment</option>
                    <option value="manual_count">Manual Count</option>
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Notes (optional)</label>
                  <input type="text" value={updateNotes} onChange={e => setUpdateNotes(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="Optional notes" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setUpdateModal(null)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button onClick={handleUpdateStock} disabled={updating || !updateQty} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {updating && <Loader2 size={14} className="animate-spin" />} Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Item Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Add Item</h2>
                <button onClick={() => setShowAddModal(false)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Name</label>
                  <input type="text" value={newIngredient.name} onChange={e => handleNameChange(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="Item name" autoFocus />
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1.5 flex items-center gap-1.5">
                    Type
                    {classifying && <Sparkles size={11} className="text-noch-green animate-pulse" />}
                    {!classifying && newIngredient.name.length >= 3 && <span className="text-noch-green text-[10px]">AI classified</span>}
                  </label>
                  <div className="flex gap-2">
                    {['consumable', 'equipment'].map(type => (
                      <button key={type} type="button" onClick={() => setNewIngredient(prev => ({ ...prev, track_type: type }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${newIngredient.track_type === type ? (type === 'consumable' ? 'bg-noch-green/15 border-noch-green/40 text-noch-green' : 'bg-blue-500/15 border-blue-500/40 text-blue-400') : 'border-noch-border text-noch-muted hover:text-white'}`}>
                        {type === 'consumable' ? '🧴 Consumable' : '🔧 Equipment'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Base Unit</label>
                    <select value={newIngredient.base_unit} onChange={e => setNewIngredient({ ...newIngredient, base_unit: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50">
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Bulk Unit</label>
                    <select value={newIngredient.bulk_unit} onChange={e => setNewIngredient({ ...newIngredient, bulk_unit: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50">
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Bulk Qty</label>
                    <input type="number" value={newIngredient.bulk_qty} onChange={e => setNewIngredient({ ...newIngredient, bulk_qty: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="1" />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Bulk Cost (LYD)</label>
                    <input type="number" value={newIngredient.bulk_cost} onChange={e => setNewIngredient({ ...newIngredient, bulk_cost: e.target.value })} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="0.00" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button onClick={handleAddIngredient} disabled={adding || !newIngredient.name} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {adding && <Loader2 size={14} className="animate-spin" />} Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supplier Modal */}
        {supplierModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Edit Supplier</h2>
                <button onClick={() => setSupplierModal(null)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Supplier Name</label>
                  <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="Supplier name" autoFocus />
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Contact</label>
                  <input type="text" value={supplierContact} onChange={e => setSupplierContact(e.target.value)} className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50" placeholder="Phone, email, etc." />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setSupplierModal(null)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button onClick={handleSaveSupplier} disabled={savingSupplier} className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors disabled:opacity-50 flex items-center gap-2">
                  {savingSupplier && <Loader2 size={14} className="animate-spin" />} Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
