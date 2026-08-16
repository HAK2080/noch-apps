// ProductCatalog.jsx — Unified product management across POS, inventory & sales
// Route: /products (authenticated users)

import { useState, useEffect, useRef } from 'react'
import {
  Plus, Search, Edit2, Trash2, Upload, Package, TrendingUp, Layers, X,
  ScanLine, Image, ChevronDown, Eye, EyeOff, History, ShoppingBag, Loader2, Sparkles
} from 'lucide-react'
import Layout from '../components/Layout'
import toast from 'react-hot-toast'
import {
  getPOSBranches, getAllProducts, getAllCategories,
  createPOSProduct, updatePOSProduct, deletePOSProduct,
  getProductSalesStats, uploadProductImage, getProductCostComponents,
  replaceProductCostComponents,
} from '../modules/pos/lib/pos-supabase'
import { useAuth } from '../contexts/AuthContext'
import BarcodeScanner from '../modules/pos/components/BarcodeScanner'
import CoffeeConsumptionField from '../modules/pos/components/CoffeeConsumptionField'
import ProductCostComponents from '../modules/pos/components/ProductCostComponents'
import {
  STOCK_UNIT_OPTIONS,
  convertDisplayedQuantity,
  formatStockQuantity,
  fromBaseQuantity,
  getStockBaseUnit,
  toBaseQuantity,
} from '../modules/pos/lib/inventory-units'
import { calculateRetailCoffeeCost, normalizeCoffeeGrams } from '../modules/pos/lib/coffee-consumption'
import { calculateProductCost, serializeCostComponents } from '../modules/pos/lib/product-costing'
import { formatImageBytes, optimizeProductImage } from '../modules/pos/lib/product-image-processing'
import { NEW_PRODUCT_VISIBILITY } from '../modules/pos/lib/product-visibility'
import {
  changeProductPrimaryCategory,
  getProductCategoryIds,
  normalizeProductCategorySelection,
  productBelongsToCategory,
} from '../lib/product-categories'

// ─── helpers ──────────────────────────────────────────────────
function fmt(n) { return parseFloat(n || 0).toFixed(3) }

// ─── Margin display ───────────────────────────────────────────
function Margin({ price, cost, size = 'sm' }) {
  if (!cost || !price || parseFloat(price) === 0) return null
  const m = ((parseFloat(price) - parseFloat(cost)) / parseFloat(price) * 100)
  const color = m >= 55 ? 'text-emerald-400' : m >= 35 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-semibold ${color} text-${size}`}>{m.toFixed(0)}%</span>
}

// ─── Stock badge ──────────────────────────────────────────────
function StockBadge({ qty, threshold, track, unit }) {
  if (!track) return null
  const n = parseFloat(qty) || 0
  const t = parseFloat(threshold) || 5
  if (n <= 0) return <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/12 text-red-400 border border-red-500/20">Out</span>
  if (n <= t) return <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/12 text-amber-400 border border-amber-500/20">Low {formatStockQuantity(n, unit)}</span>
  return <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">{formatStockQuantity(n, unit)}</span>
}

// ─── Product card ─────────────────────────────────────────────
function ProductCard({ product, stats, onEdit, onDelete }) {
  const qty = stats?.qty || 0
  const revenue = stats?.revenue || 0
  const additionalCategoryCount = Math.max(0, getProductCategoryIds(product).length - 1)
  return (
    <div
      className="group rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-bright)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onClick={() => onEdit && onEdit(product)}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--surface)' }}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 opacity-40">
            <ShoppingBag size={26} className="text-zinc-500" />
          </div>
        )}
        {/* Category pill */}
        {product.pos_categories && (
          <span
            className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: product.pos_categories.color + '28', color: product.pos_categories.color }}
          >
            {product.pos_categories.name}{additionalCategoryCount > 0 ? ` +${additionalCategoryCount}` : ''}
          </span>
        )}
        {/* Hidden badge */}
        {!product.is_active && (
          <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-800/90 text-zinc-400 border border-zinc-600/40">
            <EyeOff size={9} /> Hidden
          </span>
        )}
        {/* Delete on hover (owner only) */}
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(product) }}
            className="absolute bottom-2 right-2 w-6 h-6 rounded-full items-center justify-center hidden group-hover:flex bg-red-500/80 text-white transition-all"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-white font-semibold text-sm leading-tight truncate">{product.name}</p>
        {product.name_ar && <p className="text-zinc-500 text-xs mt-0.5 truncate" dir="rtl">{product.name_ar}</p>}

        <div className="flex items-end justify-between mt-2">
          <div>
            <p className="text-noch-green font-bold text-base leading-none">{fmt(product.price)}</p>
            {product.cost_price && <p className="text-zinc-600 text-[11px] leading-tight">cost {fmt(product.cost_price)}</p>}
            {product.is_coffee_bean && product.stock_cost_per_base_unit && (
              <p className="text-amber-400/80 text-[11px] leading-tight">{Number(product.stock_cost_per_base_unit).toFixed(5)} LYD/g</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StockBadge qty={product.stock_qty} threshold={product.low_stock_alert} track={product.track_inventory} unit={product.stock_display_unit} />
            <Margin price={product.price} cost={product.cost_price} size="xs" />
          </div>
        </div>

        {qty > 0 && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t text-[11px] text-zinc-500" style={{ borderColor: 'var(--border)' }}>
            <TrendingUp size={10} className="text-noch-green flex-shrink-0" />
            <span>{qty} sold · {fmt(revenue)} LYD</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit / Add modal ─────────────────────────────────────────
const BLANK = {
  name: '', name_ar: '', price: '', cost_price: '', manual_cost_lyd: '', barcode: '', sku: '',
  category_id: '', secondary_category_ids: [], track_inventory: false, stock_qty: '0',
  low_stock_alert: '5', is_active: true, image_url: '', cost_recipe_id: '',
  stock_base_unit: 'pc', stock_display_unit: 'pc',
  coffee_grams_per_sale: '', coffee_bean_product_id: '',
  is_coffee_bean: false, stock_cost_per_base_unit: '', retail_pack_size_base_units: '250',
  visible_branch_ids: [], ...NEW_PRODUCT_VISIBILITY,
  is_available: true,
}

function ProductModal({ product, products, categories, branches, canEditCost, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    if (product) {
      const displayUnit = product.stock_display_unit || product.stock_base_unit || 'pc'
      const categorySelection = normalizeProductCategorySelection(
        product.category_id,
        product.secondary_category_ids,
      )
      return {
        ...BLANK,
        ...product,
        ...categorySelection,
        price: product.price ?? '',
        cost_price: product.cost_price ?? '',
        manual_cost_lyd: product.manual_cost_lyd ?? product.cost_price ?? '',
        cost_recipe_id: product.cost_recipe_id ?? '',
        stock_base_unit: product.stock_base_unit || getStockBaseUnit(displayUnit),
        stock_display_unit: displayUnit,
        stock_qty: fromBaseQuantity(product.stock_qty, displayUnit),
        low_stock_alert: fromBaseQuantity(product.low_stock_alert, displayUnit),
      }
    }
    // New product: default to ALL branches selected, customer-menu ON.
    // Owner can opt out of a branch by clicking it off.
    return {
      ...BLANK,
      visible_branch_ids: (branches || []).map(b => b.id),
    }
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [optimizingImage, setOptimizingImage] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [costComponents, setCostComponents] = useState([])
  const [costComponentsLoading, setCostComponentsLoading] = useState(!!product?.id)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const fileRef = useRef()
  const isEdit = !!product?.id

  // Revoke object URL when modal closes / file changes (avoid memory leak)
  useEffect(() => () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview) }, [pendingPreview])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const changePrimaryCategory = (nextCategoryId) => {
    setForm(current => ({
      ...current,
      ...changeProductPrimaryCategory(current, nextCategoryId),
    }))
  }

  const toggleAdditionalCategory = (categoryId) => {
    setForm(current => {
      if (!current.category_id) {
        return { ...current, ...changeProductPrimaryCategory(current, categoryId) }
      }

      const secondaryIds = Array.isArray(current.secondary_category_ids)
        ? current.secondary_category_ids
        : []
      return {
        ...current,
        secondary_category_ids: secondaryIds.includes(categoryId)
          ? secondaryIds.filter(id => id !== categoryId)
          : [...secondaryIds, categoryId],
      }
    })
  }

  const changeStockUnit = (nextUnit) => setForm(current => {
    const previousUnit = current.stock_display_unit || 'pc'
    const sameDimension = getStockBaseUnit(previousUnit) === getStockBaseUnit(nextUnit)
    return {
      ...current,
      stock_base_unit: getStockBaseUnit(nextUnit),
      stock_display_unit: nextUnit,
      stock_qty: sameDimension ? convertDisplayedQuantity(current.stock_qty, previousUnit, nextUnit) : '0',
      low_stock_alert: sameDimension ? convertDisplayedQuantity(current.low_stock_alert, previousUnit, nextUnit) : '5',
    }
  })

  // New product: auto-select all branches once they load (modal often opens
  // before parent finishes fetching branches, so the initializer sees []).
  useEffect(() => {
    if (isEdit) return
    if (!branches?.length) return
    setForm(f => (f.visible_branch_ids?.length ? f : { ...f, visible_branch_ids: branches.map(b => b.id) }))
  }, [branches, isEdit])

  useEffect(() => {
    let cancelled = false
    if (!product?.id || !canEditCost) {
      setCostComponentsLoading(false)
      return undefined
    }
    getProductCostComponents(product.id)
      .then(rows => {
        if (!cancelled) setCostComponents(rows.map(row => ({ ...row })))
      })
      .catch(error => {
        if (!cancelled) toast.error(error.message || 'Failed to load product ingredients')
      })
      .finally(() => {
        if (!cancelled) setCostComponentsLoading(false)
      })
    return () => { cancelled = true }
  }, [product?.id, canEditCost])

  const toggleBranch = (id) => setForm(f => {
    const cur = Array.isArray(f.visible_branch_ids) ? f.visible_branch_ids : []
    return { ...f, visible_branch_ids: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] }
  })

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return toast.error('Name and price required')
    if (costComponentsLoading) return toast.error('Please wait for ingredients to finish loading')

    const productCost = calculateProductCost({
      components: costComponents,
      inventoryProducts: products,
      coffeeGrams: form.is_coffee_bean ? null : form.coffee_grams_per_sale,
      coffeeBeanProductId: resolvedCoffeeBeanProductId,
      manualProductCost: form.manual_cost_lyd,
    })
    const costIsComplete = productCost.source !== 'incomplete'
    const categorySelection = normalizeProductCategorySelection(
      form.category_id,
      form.secondary_category_ids,
    )
    setSaving(true)
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        price: parseFloat(form.price) || 0,
        cost_price: form.is_coffee_bean && form.stock_cost_per_base_unit && form.retail_pack_size_base_units
          ? calculateRetailCoffeeCost(form.stock_cost_per_base_unit, form.retail_pack_size_base_units)
          : canEditCost && costIsComplete ? productCost.effectiveCost : (product?.cost_price ?? null),
        cost_lyd: form.is_coffee_bean && form.stock_cost_per_base_unit && form.retail_pack_size_base_units
          ? calculateRetailCoffeeCost(form.stock_cost_per_base_unit, form.retail_pack_size_base_units)
          : canEditCost && costIsComplete ? productCost.effectiveCost : (product?.cost_lyd ?? null),
        manual_cost_lyd: canEditCost
          ? (form.manual_cost_lyd === '' ? null : parseFloat(form.manual_cost_lyd))
          : (product?.manual_cost_lyd ?? product?.cost_price ?? null),
        stock_cost_per_base_unit: form.stock_cost_per_base_unit ? parseFloat(form.stock_cost_per_base_unit) : null,
        retail_pack_size_base_units: form.retail_pack_size_base_units ? parseFloat(form.retail_pack_size_base_units) : null,
        is_coffee_bean: !!form.is_coffee_bean,
        cost_recipe_id: form.cost_recipe_id || null,
        stock_base_unit: getStockBaseUnit(form.stock_display_unit),
        stock_display_unit: form.stock_display_unit,
        stock_qty: toBaseQuantity(parseFloat(form.stock_qty) || 0, form.stock_display_unit),
        low_stock_alert: toBaseQuantity(parseFloat(form.low_stock_alert) || 5, form.stock_display_unit),
        coffee_grams_per_sale: normalizeCoffeeGrams(form.coffee_grams_per_sale),
        coffee_bean_product_id: normalizeCoffeeGrams(form.coffee_grams_per_sale) ? (resolvedCoffeeBeanProductId || null) : null,
        category_id: categorySelection.category_id || null,
        secondary_category_ids: categorySelection.secondary_category_ids,
        visible_branch_ids: Array.isArray(form.visible_branch_ids) ? form.visible_branch_ids : [],
        visible_on_menu:          !!form.visible_on_menu,
        visible_on_customer_menu: form.visible_on_customer_menu !== false,
        visible_on_website:       form.visible_on_website !== false,
        is_available:       form.is_available !== false,
      }
      // Drop legacy single-branch field — visibility lives in the array now
      delete payload.branch_id
      // Strip joined-relation keys returned by select('*, foo(...)')
      delete payload.pos_categories
      delete payload.pos_branches

      let saved
      if (isEdit) {
        saved = await updatePOSProduct(product.id, payload)
      } else {
        saved = await createPOSProduct(payload)
      }

      if (canEditCost && costIsComplete) {
        await replaceProductCostComponents(saved.id, serializeCostComponents(costComponents))
      }

      // If the user picked a photo before saving (new product flow), upload now
      if (pendingFile && saved?.id) {
        try {
          await uploadProductImage(saved.id, pendingFile)
        } catch (err) {
          toast.error('Saved, but photo upload failed: ' + (err.message || 'unknown'))
        }
        setPendingFile(null)
        if (pendingPreview) { URL.revokeObjectURL(pendingPreview); setPendingPreview(null) }
      }
      toast.success(isEdit ? 'Product updated' : 'Product created')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // For existing products: upload immediately so the URL is live.
    // For new products: defer the upload until Save (we need the product ID first).
    if (product?.id) {
      setUploading(true)
      try {
        const url = await uploadProductImage(product.id, file)
        set('image_url', url)
        toast.success('Photo uploaded')
      } catch (err) {
        toast.error(err.message || 'Upload failed')
      } finally {
        setUploading(false)
      }
    } else {
      // Stash the file + a local preview; uploaded after createPOSProduct returns the ID
      setPendingFile(file)
      if (pendingPreview) URL.revokeObjectURL(pendingPreview)
      setPendingPreview(URL.createObjectURL(file))
    }
  }

  const handleOptimizeImage = async () => {
    if (!pendingFile && !form.image_url) return toast.error('Add a product image first')

    setOptimizingImage(true)
    try {
      let sourceFile = pendingFile
      if (!sourceFile) {
        const response = await fetch(form.image_url, { cache: 'no-store' })
        if (!response.ok) throw new Error('Could not download the current image')

        const blob = await response.blob()
        const filename = new URL(form.image_url, window.location.origin).pathname.split('/').pop() || 'product-image'
        sourceFile = new File([blob], filename, { type: blob.type || 'image/jpeg' })
      }

      const optimized = await optimizeProductImage(sourceFile)
      if (product?.id) {
        const url = await uploadProductImage(product.id, optimized.file)
        set('image_url', url)
      } else {
        if (pendingPreview) URL.revokeObjectURL(pendingPreview)
        setPendingFile(optimized.file)
        setPendingPreview(URL.createObjectURL(optimized.file))
      }

      toast.success(`Image optimized to 4:5 WebP (${formatImageBytes(optimized.optimizedBytes)})`)
    } catch (err) {
      toast.error(err.message || 'Image optimization failed')
    } finally {
      setOptimizingImage(false)
    }
  }

  const beanProducts = (products || []).filter(candidate => candidate.is_coffee_bean && candidate.id !== product?.id)
  const defaultBeanProduct = beanProducts.find(candidate => candidate.name?.toLowerCase().includes('ghadamis')) || beanProducts[0]
  const resolvedCoffeeBeanProductId = form.coffee_bean_product_id || defaultBeanProduct?.id || ''
  const calculatedRetailCost = form.is_coffee_bean && form.stock_cost_per_base_unit && form.retail_pack_size_base_units
    ? calculateRetailCoffeeCost(form.stock_cost_per_base_unit, form.retail_pack_size_base_units)
    : null
  const productCost = calculateProductCost({
    components: costComponents,
    inventoryProducts: products,
    coffeeGrams: form.is_coffee_bean ? null : form.coffee_grams_per_sale,
    coffeeBeanProductId: resolvedCoffeeBeanProductId,
    manualProductCost: form.manual_cost_lyd,
  })
  const effectiveCost = calculatedRetailCost ?? productCost.effectiveCost
  const margin = form.price && effectiveCost !== null
    ? ((parseFloat(form.price) - effectiveCost) / parseFloat(form.price) * 100)
    : null

  return (
    <>
      {showScanner && (
        <BarcodeScanner onScan={v => { set('barcode', v); setShowScanner(false) }} onClose={() => setShowScanner(false)} />
      )}
      <div className="fixed inset-0 z-50 bg-black/75 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="w-full md:max-w-xl md:rounded-2xl rounded-t-2xl max-h-[94vh] overflow-y-auto flex flex-col"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="text-white font-bold">{isEdit ? `Edit: ${product.name}` : 'New Product'}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
          </div>

          <div className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">

            {/* Photo — works on Add and Edit. New products: image is uploaded after Save. */}
            <div className="flex items-start gap-4">
              <div className="w-20 aspect-[4/5] rounded-xl overflow-hidden flex-shrink-0" style={{ background: '#f8f3e8', border: '1px solid var(--border)' }}>
                {(pendingPreview || form.image_url)
                  ? <img src={pendingPreview || form.image_url} alt="" className="w-full h-full object-contain" />
                  : <div className="w-full h-full flex items-center justify-center"><Image size={22} className="text-zinc-600" /></div>
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium mb-1.5">Product Photo</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || optimizingImage}
                    className="btn-secondary h-10 min-w-[140px] px-3 text-sm flex items-center justify-center gap-1.5"
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {uploading ? 'Uploading…' : (pendingPreview || form.image_url) ? 'Change photo' : 'Upload photo'}
                  </button>
                  <button
                    type="button"
                    onClick={handleOptimizeImage}
                    disabled={uploading || optimizingImage || (!pendingPreview && !form.image_url)}
                    className="btn-secondary h-10 min-w-[140px] px-3 text-sm flex items-center justify-center gap-1.5"
                    title="Convert to a 1200 × 1500 WebP without cropping"
                  >
                    {optimizingImage ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {optimizingImage ? 'Optimizing…' : 'Optimize Image'}
                  </button>
                </div>
                <p className="text-zinc-600 text-[11px] mt-1">
                  JPG, PNG, WebP · optimize to 1200 × 1500 WebP without cropping
                  {!isEdit && pendingFile && <> · <span className="text-noch-green">will upload on Save</span></>}
                </p>
              </div>
            </div>

            {/* Names */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Name (EN) *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} className="input" placeholder="Cappuccino" />
              </div>
              <div>
                <label className="label">Name (AR)</label>
                <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} className="input text-right" dir="rtl" placeholder="كابوتشينو" />
              </div>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sale Price (LYD) *</label>
                <input type="number" value={form.price} onChange={e => set('price', e.target.value)} className="input" placeholder="8.500" step="0.001" min="0" />
              </div>
              <div>
                <label className="label">Manual cost fallback (LYD)</label>
                <input type="number" value={form.manual_cost_lyd} onChange={e => set('manual_cost_lyd', e.target.value)} className="input" placeholder="3.200" step="0.001" min="0" disabled={!canEditCost} />
              </div>
            </div>

            {/* Margin live */}
            {margin !== null && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <TrendingUp size={14} className={margin >= 55 ? 'text-emerald-400' : margin >= 35 ? 'text-amber-400' : 'text-red-400'} />
                <span className="text-zinc-400 text-xs">Gross margin:</span>
                <span className={`font-bold ${margin >= 55 ? 'text-emerald-400' : margin >= 35 ? 'text-amber-400' : 'text-red-400'}`}>{margin.toFixed(1)}%</span>
                <span className="text-zinc-600 text-xs ml-auto">profit {fmt(parseFloat(form.price || 0) - effectiveCost)} LYD</span>
              </div>
            )}

            <div className="rounded-xl border border-noch-border p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.is_coffee_bean}
                  onChange={event => setForm(current => ({
                    ...current,
                    is_coffee_bean: event.target.checked,
                    stock_base_unit: event.target.checked ? 'g' : current.stock_base_unit,
                    stock_display_unit: event.target.checked ? 'kg' : current.stock_display_unit,
                    retail_pack_size_base_units: event.target.checked ? (current.retail_pack_size_base_units || '250') : current.retail_pack_size_base_units,
                  }))}
                  className="w-4 h-4 accent-noch-green"
                />
                <span className="text-white text-sm font-semibold">Coffee bean stock item</span>
              </label>
              {form.is_coffee_bean && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="label">Base cost (LYD/g)</label>
                    <input type="number" value={form.stock_cost_per_base_unit ?? ''} onChange={e => set('stock_cost_per_base_unit', e.target.value)} className="input" step="0.000001" min="0" placeholder="0.093470" />
                  </div>
                  <div>
                    <label className="label">Retail bag size (g)</label>
                    <input type="number" value={form.retail_pack_size_base_units ?? ''} onChange={e => set('retail_pack_size_base_units', e.target.value)} className="input" step="1" min="1" placeholder="250" />
                  </div>
                  {calculatedRetailCost !== null && (
                    <p className="col-span-2 text-noch-muted text-xs">
                      Retail bag cost: <span className="text-white font-semibold">{calculatedRetailCost.toFixed(3)} LYD</span>. The sale price above remains the customer price.
                    </p>
                  )}
                </div>
              )}
            </div>

            {!form.is_coffee_bean && <CoffeeConsumptionField
              value={form.coffee_grams_per_sale}
              onChange={value => set('coffee_grams_per_sale', value)}
              beanProductId={form.coffee_bean_product_id}
              onBeanProductChange={value => set('coffee_bean_product_id', value)}
              beanProducts={beanProducts}
            />}

            {canEditCost && (
              costComponentsLoading
                ? <div className="rounded-xl border border-noch-border p-4 text-center text-noch-muted text-xs">Loading ingredients…</div>
                : <ProductCostComponents
                    components={costComponents}
                    onChange={setCostComponents}
                    inventoryProducts={(products || []).filter(candidate => candidate.id !== product?.id)}
                    coffeeGrams={form.is_coffee_bean ? null : form.coffee_grams_per_sale}
                    coffeeBeanProductId={resolvedCoffeeBeanProductId}
                    manualProductCost={form.manual_cost_lyd}
                  />
            )}

            {/* Main category + SKU */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Main category</label>
                <select value={form.category_id} onChange={e => changePrimaryCategory(e.target.value)} className="input">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">SKU</label>
                <input value={form.sku} onChange={e => set('sku', e.target.value)} className="input" placeholder="CAP-001" />
              </div>
            </div>

            {/* Additional categories used by POS and customer menus */}
            {categories.length > 0 && (
              <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div>
                    <p className="text-white text-xs font-semibold">Also appears in</p>
                    <p className="text-zinc-600 text-[11px]">Select every category where customers should find this product.</p>
                  </div>
                  <span className="text-noch-muted text-[11px] whitespace-nowrap">{getProductCategoryIds(form).length} selected</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(category => {
                    const isPrimary = form.category_id === category.id
                    const isAdditional = (form.secondary_category_ids || []).includes(category.id)
                    const selected = isPrimary || isAdditional
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          if (isPrimary) return
                          toggleAdditionalCategory(category.id)
                        }}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          selected
                            ? 'bg-noch-green/15 border-noch-green/40 text-noch-green'
                            : 'border-noch-border text-noch-muted hover:text-white'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{category.name}{isPrimary ? ' · Main' : ''}
                      </button>
                    )
                  })}
                </div>
                <p className="text-zinc-600 text-[11px] mt-2.5">Every selected category is used in the POS and customer menu.</p>
              </div>
            )}

            {/* Barcode */}
            <div>
              <label className="label">Barcode</label>
              <div className="flex gap-2">
                <input value={form.barcode} onChange={e => set('barcode', e.target.value)} className="input flex-1" placeholder="1234567890" />
                <button onClick={() => setShowScanner(true)} className="btn-secondary px-3"><ScanLine size={14} /></button>
              </div>
            </div>

            {/* Inventory tracking */}
            <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('track_inventory', !form.track_inventory)}>
                <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                  style={{ background: form.track_inventory ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.track_inventory ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-white text-sm font-medium">Track stock level</span>
              </label>
              {form.track_inventory && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Current Stock</label>
                    <input type="number" value={form.stock_qty} onChange={e => set('stock_qty', e.target.value)} className="input" step="0.01" />
                  </div>
                  <div>
                    <label className="label">Low Stock Alert</label>
                    <input type="number" value={form.low_stock_alert} onChange={e => set('low_stock_alert', e.target.value)} className="input" step="0.01" />
                  </div>
                  <div>
                    <label className="label">Unit</label>
                    <select value={form.stock_display_unit} onChange={e => changeStockUnit(e.target.value)} className="input">
                      {STOCK_UNIT_OPTIONS.map(unit => <option key={unit.value} value={unit.value}>{unit.label} ({unit.shortLabel})</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Where this product is sold */}
            <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Where this product is sold</p>

              {(branches || []).length > 0 && (
                <div>
                  <p className="text-white text-xs font-medium mb-2">Branches</p>
                  <div className="flex flex-wrap gap-2">
                    {branches.map(b => {
                      const on = (form.visible_branch_ids || []).includes(b.id)
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBranch(b.id)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            on
                              ? 'bg-noch-green/15 border-noch-green/40 text-noch-green'
                              : 'border-noch-border text-noch-muted hover:text-white'
                          }`}
                        >
                          {on ? '✓ ' : ''}{b.name}
                        </button>
                      )
                    })}
                  </div>
                  {(form.visible_branch_ids || []).length === 0 && (
                    <p className="mt-2 text-amber-400 text-[11px] flex items-center gap-1">
                      ⚠ Not selected at any branch — this product won't appear on any menu.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('visible_on_menu', !form.visible_on_menu)}>
                  <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                    style={{ background: form.visible_on_menu ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.visible_on_menu ? 'translate-x-4' : ''}`} />
                  </div>
                  <div>
                    <p className="text-white text-sm">POS Menu</p>
                    <p className="text-zinc-600 text-xs">Visible to staff on the POS terminal</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('visible_on_customer_menu', !form.visible_on_customer_menu)}>
                  <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                    style={{ background: form.visible_on_customer_menu !== false ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.visible_on_customer_menu !== false ? 'translate-x-4' : ''}`} />
                  </div>
                  <div>
                    <p className="text-white text-sm">Customer Menu</p>
                    <p className="text-zinc-600 text-xs">Visible to customers on the ordering page</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('visible_on_website', !form.visible_on_website)}>
                  <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                    style={{ background: form.visible_on_website !== false ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.visible_on_website !== false ? 'translate-x-4' : ''}`} />
                  </div>
                  <div>
                    <p className="text-white text-sm">Online Store</p>
                    <p className="text-zinc-600 text-xs">Retail products — tools, coffee bags, tea bags…</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('is_available', !form.is_available)}>
                  <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                    style={{ background: form.is_available ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.is_available ? 'translate-x-4' : ''}`} />
                  </div>
                  <div>
                    <p className="text-white text-sm">Available now</p>
                    <p className="text-zinc-600 text-xs">{form.is_available ? 'Customers can order this' : 'Shown shaded with “Sold out” — creates FOMO'}</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('is_active', !form.is_active)}>
                  <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                    style={{ background: form.is_active ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
                  </div>
                  <div>
                    <p className="text-white text-sm">Active product</p>
                    <p className="text-zinc-600 text-xs">{form.is_active ? 'Live in catalog' : 'Archived — hidden everywhere'}</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : isEdit ? 'Update' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Role permissions ─────────────────────────────────────────
// Product permissions remain role-scoped. Inventory quantity changes have
// their own audited POS flow and do not require broad catalog-edit access.
function getProductPerms(role) {
  if (role === 'owner')      return { canEdit: true,  cost: true }
  if (role === 'supervisor') return { canEdit: true,  cost: false }
  if (role === 'staff')      return { canEdit: true,  cost: false }
  if (role === 'accountant') return { canEdit: true,  cost: true }
  if (role === 'data_entry') return { canEdit: true,  cost: true }
  return { canEdit: false, cost: false }
}

// ─── Main page ────────────────────────────────────────────────
export default function ProductCatalog() {
  const { profile } = useAuth()
  const perms = getProductPerms(profile?.role)
  const canEdit = perms.canEdit

  const [branches, setBranches] = useState([])
  const [activeBranch, setActiveBranch] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [salesStats, setSalesStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  // local dates, not UTC (toISOString shifts a day back in Libya UTC+2)
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })
  const [dateTo, setDateTo] = useState(() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })
  const [editProduct, setEditProduct] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  // Load branches once.
  useEffect(() => {
    getPOSBranches()
      .then(b => {
        setBranches(b)
        // activeBranch is now optional — used as a FILTER on the global catalog,
        // not a scope for what's loaded
      })
      .catch(err => toast.error(err.message || 'Failed to load'))
  }, [])

  useEffect(() => {
    load()
  }, [dateFrom, dateTo])

  const load = async () => {
    setLoading(true)
    try {
      const [p, c, s] = await Promise.all([
        getAllProducts(),
        getAllCategories(),
        // sales stats still per-branch; default to first branch if none active
        activeBranch ? getProductSalesStats(activeBranch.id, dateFrom, dateTo) : Promise.resolve({}),
      ])
      setProducts(p); setCategories(c); setSalesStats(s)
    } catch (err) {
      toast.error(err.message || 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (product) => {
    if (!confirm(`Delete "${product.name}"?`)) return
    try {
      await deletePOSProduct(product.id)
      setProducts(ps => ps.filter(p => p.id !== product.id))
      toast.success('Deleted')
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  const filtered = products.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      const hit = p.name.toLowerCase().includes(q) ||
        (p.name_ar && p.name_ar.includes(search)) ||
        (p.barcode && p.barcode.includes(search)) ||
        (p.sku && p.sku.toLowerCase().includes(q))
      if (!hit) return false
    }
    if (categoryFilter && !productBelongsToCategory(p, categoryFilter)) return false
    return true
  })

  // Stats
  const lowStock = products.filter(p => p.track_inventory && parseFloat(p.stock_qty) <= parseFloat(p.low_stock_alert || 5)).length
  const withCost = products.filter(p => p.cost_price).length
  const margins = products.filter(p => p.cost_price && p.price && parseFloat(p.price) > 0)
    .map(p => (parseFloat(p.price) - parseFloat(p.cost_price)) / parseFloat(p.price) * 100)
  const avgMargin = margins.length > 0 ? (margins.reduce((s, m) => s + m, 0) / margins.length).toFixed(0) : null
  const totalRevenue = Object.values(salesStats).reduce((s, x) => s + (x.revenue || 0), 0)

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Layers size={20} className="text-noch-green" />
              Products
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">Central catalog — synced with POS, inventory & cost calculator</p>
          </div>
          {canEdit && (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
              <Plus size={14} /> Add Product
            </button>
          )}
        </div>

        {/* Branch tabs */}
        {branches.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {branches.map(b => (
              <button key={b.id} onClick={() => setActiveBranch(b)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={activeBranch?.id === b.id
                  ? { background: 'rgba(74,222,128,0.1)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.25)' }
                  : { background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }
                }
              >{b.name}</button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Products', value: products.length },
            { label: 'Low / Out of Stock', value: lowStock, warn: lowStock > 0 },
            { label: 'Cost Tracked', value: `${withCost} / ${products.length}` },
            { label: avgMargin ? 'Avg Gross Margin' : 'Revenue (period)', value: avgMargin ? `${avgMargin}%` : `${fmt(totalRevenue)} LYD`, green: !!avgMargin },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p className="text-zinc-500 text-xs mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.warn ? 'text-amber-400' : s.green ? 'text-noch-green' : 'text-white'}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search name, SKU, barcode…" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input w-auto min-w-36">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-2 rounded-xl px-3 border text-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <TrendingUp size={13} className="text-zinc-500 flex-shrink-0" />
            <span className="text-zinc-500 text-xs">Sales:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-white text-xs outline-none" />
            <span className="text-zinc-600">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-white text-xs outline-none" />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-24 text-zinc-500">Loading products…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag size={40} className="mx-auto text-zinc-700 mb-3" />
            <p className="text-zinc-400 font-medium">{products.length === 0 ? 'No products yet' : 'No matches'}</p>
            <p className="text-zinc-600 text-sm mt-1">{products.length === 0 ? 'Add your first product to get started' : 'Try a different search or filter'}</p>
            {products.length === 0 && canEdit && <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 text-sm">Add Product</button>}
          </div>
        ) : (
          <>
            <p className="text-zinc-600 text-xs mb-3">{filtered.length} product{filtered.length !== 1 ? 's' : ''}{search || categoryFilter ? ' (filtered)' : ''}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  stats={salesStats[p.id]}
                  onEdit={canEdit ? setEditProduct : undefined}
                  onDelete={canEdit ? handleDelete : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {(showAdd || editProduct) && (
        <ProductModal
          product={editProduct || null}
          products={products}
          categories={categories}
          branches={branches}
          canEditCost={perms.cost}
          onSave={() => { setShowAdd(false); setEditProduct(null); load() }}
          onClose={() => { setShowAdd(false); setEditProduct(null) }}
        />
      )}
    </Layout>
  )
}
