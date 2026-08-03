// BranchStock.jsx — Per-branch product stock with editable par levels
// Route: /inventory/branch-stock
// Branch stock is location_product_stock for the selected branch. Min/target
// par levels live in pos_product_branch_par (write: owner/supervisor only).
// Rows below min are red, below target amber.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Store, Search } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getPOSBranches } from '../../modules/pos/lib/pos-supabase'
import { formatStockQuantity } from '../../modules/pos/lib/inventory-units'
import { listBranchPar, listBranchStock, upsertBranchPar } from './lib/warehouse'
import toast from 'react-hot-toast'

function ParRow({ product, par, canEdit, onSave, arabic }) {
  const [minQty, setMinQty] = useState(par?.min_qty != null ? String(par.min_qty) : '')
  const [targetQty, setTargetQty] = useState(par?.target_qty != null ? String(par.target_qty) : '')
  const [saving, setSaving] = useState(false)

  const stock = parseFloat(product.branch_stock_qty) || 0
  const min = parseFloat(minQty) || 0
  const target = parseFloat(targetQty) || 0

  const belowMin = min > 0 && stock < min
  const belowTarget = !belowMin && target > 0 && stock < target
  const rowTone = belowMin
    ? 'bg-red-500/5 border-l-2 border-red-500/60'
    : belowTarget
    ? 'bg-amber-500/5 border-l-2 border-amber-500/60'
    : 'border-l-2 border-transparent'

  async function save() {
    const newMin = parseFloat(minQty) || 0
    const newTarget = parseFloat(targetQty) || 0
    if (newMin === (parseFloat(par?.min_qty) || 0) && newTarget === (parseFloat(par?.target_qty) || 0)) return
    setSaving(true)
    try {
      await onSave(product.id, newMin, newTarget)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`grid grid-cols-[1fr_70px_76px_76px] gap-2 px-4 py-2.5 items-center ${rowTone}`}>
      <p className="text-white text-sm font-medium truncate">
        {arabic ? product.name_ar || product.name : product.name} <span className="text-noch-muted text-xs">({product.stock_base_unit})</span>
      </p>
      <p className={`text-sm font-bold text-right tabular-nums ${belowMin ? 'text-red-400' : belowTarget ? 'text-amber-400' : 'text-noch-green'}`}>
        {formatStockQuantity(stock, product.stock_display_unit)}
      </p>
      {canEdit ? (
        <>
          <input
            type="number"
            min="0"
            step="0.01"
            value={minQty}
            disabled={saving}
            onChange={e => setMinQty(e.target.value)}
            onBlur={save}
            placeholder="0"
            className="input py-1 px-2 text-xs text-center w-full"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={targetQty}
            disabled={saving}
            onChange={e => setTargetQty(e.target.value)}
            onBlur={save}
            placeholder="0"
            className="input py-1 px-2 text-xs text-center w-full"
          />
        </>
      ) : (
        <>
          <p className="text-noch-muted text-xs text-right tabular-nums">{min || '—'}</p>
          <p className="text-noch-muted text-xs text-right tabular-nums">{target || '—'}</p>
        </>
      )}
    </div>
  )
}

export default function BranchStock() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const canEdit = profile?.role === 'owner' || profile?.role === 'supervisor'

  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [products, setProducts] = useState([])
  const [parMap, setParMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getPOSBranches()
      .then(bs => {
        setBranches(bs)
        if (bs.length) setBranchId(bs[0].id)
        else setLoading(false)
      })
      .catch(err => { toast.error(err.message || (arabic ? 'تعذر تحميل الفروع' : 'Failed to load branches')); setLoading(false) })
  }, [arabic])

  const loadBranch = useCallback(async (id) => {
    setLoading(true)
    try {
      const [prods, par] = await Promise.all([listBranchStock(id), listBranchPar(id)])
      setProducts(prods)
      setParMap(Object.fromEntries(par.map(p => [p.product_id, p])))
    } catch (err) {
      toast.error(err.message || (arabic ? 'تعذر تحميل مخزون الفرع' : 'Failed to load branch stock'))
    } finally {
      setLoading(false)
    }
  }, [arabic])

  useEffect(() => { if (branchId) loadBranch(branchId) }, [branchId, loadBranch])

  async function handleSavePar(productId, minQty, targetQty) {
    try {
      const saved = await upsertBranchPar(branchId, productId, minQty, targetQty)
      setParMap(prev => ({ ...prev, [productId]: saved }))
      toast.success(copy('Minimum levels saved', 'تم حفظ الحدود الدنيا'))
    } catch (err) {
      toast.error(err.message || copy('Failed to save minimum levels', 'تعذر حفظ الحدود الدنيا'))
    }
  }

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.name_ar && p.name_ar.includes(search))
  )
  const belowMinCount = products.filter(p => {
    const min = parseFloat(parMap[p.id]?.min_qty) || 0
    return min > 0 && (parseFloat(p.branch_stock_qty) || 0) < min
  }).length

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/inventory')} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Store size={18} className="text-noch-green" />
              {copy('Branch Stock', 'مخزون الفرع')}
            </h1>
            <p className="text-noch-muted text-sm">{copy('Location balance versus minimum and target', 'رصيد الموقع مقارنة بالحد الأدنى والمستهدف')}</p>
          </div>
          {belowMinCount > 0 && (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              {belowMinCount} {copy('below minimum', 'أقل من الحد')}
            </span>
          )}
        </div>

        {/* Branch selector + search */}
        <div className="flex gap-3 mb-4">
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="input w-48">
            {branches.map(b => <option key={b.id} value={b.id}>{arabic ? b.name_ar || b.name : b.name}</option>)}
          </select>
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
            <input
              type="text"
              placeholder={copy('Search products…', 'ابحث عن المنتجات…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input w-full pl-9"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_70px_76px_76px] gap-2 px-4 py-2.5 border-b border-noch-border text-xs font-semibold text-noch-muted uppercase tracking-wide">
            <span>{copy('Product', 'المنتج')}</span>
            <span className="text-right">{copy('Stock', 'المخزون')}</span>
            <span className="text-right">{copy('Min', 'الحد')}</span>
            <span className="text-right">{copy('Target', 'المستهدف')}</span>
          </div>
          {loading ? (
            <p className="text-noch-muted text-center py-10 text-sm">{copy('Loading…', 'جارٍ التحميل…')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-noch-muted text-center py-10 text-sm">{copy('No location-stock products found', 'لا توجد منتجات مخزون للموقع')}</p>
          ) : (
            <div className="divide-y divide-noch-border/50">
              {filtered.map(p => (
                <ParRow
                  key={p.id}
                  product={p}
                  par={parMap[p.id]}
                  canEdit={canEdit}
                  onSave={handleSavePar}
                  arabic={arabic}
                />
              ))}
            </div>
          )}
        </div>

        {!canEdit && (
          <p className="text-noch-muted text-xs mt-3">{copy('Minimum and target levels are editable by owner and supervisor only.', 'يمكن للمالك والمشرف فقط تعديل الحدود الدنيا والمستهدفة.')}</p>
        )}
      </div>
    </Layout>
  )
}
