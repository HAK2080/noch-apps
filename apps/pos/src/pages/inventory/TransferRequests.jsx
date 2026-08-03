// TransferRequests.jsx — Request stock from the central warehouse
// Route: /inventory/requests
// Any staff can request; cancel is owner/supervisor only (and currently
// blocked by RLS — see cancelTransfer note in lib/warehouse.js).

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PackagePlus, X, Loader2 } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatStockQuantity } from '../../modules/pos/lib/inventory-units'
import {
  listLocations, listProducts, listWarehouseStock, listTransfers,
  requestTransfer, cancelTransfer,
} from './lib/warehouse'
import toast from 'react-hot-toast'

export default function TransferRequests() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const canCancel = profile?.role === 'owner' || profile?.role === 'supervisor'

  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState('')
  const [products, setProducts] = useState([])
  const [warehouseQty, setWarehouseQty] = useState({})
  const [openRequests, setOpenRequests] = useState([])

  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [loading, setLoading] = useState(true)

  const locationName = id => locations.find(l => l.id === id)?.name || '—'

  const loadRequests = useCallback(async (locId) => {
    const all = await listTransfers({ status: 'requested', limit: 100 })
    setOpenRequests(locId ? all.filter(t => t.to_location_id === locId) : all)
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const [locs, prods, wh] = await Promise.all([
          listLocations(),
          listProducts(),
          listWarehouseStock(),
        ])
        const branchLocs = locs.filter(l => l.location_type === 'branch')
        setLocations(branchLocs)
        if (branchLocs.length) setLocationId(branchLocs[0].id)
        setProducts(prods)
        setWarehouseQty(Object.fromEntries(wh.rows.map(r => [r.product_id, parseFloat(r.qty) || 0])))
      } catch (err) {
        toast.error(err.message || (arabic ? 'تعذر التحميل' : 'Failed to load'))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [arabic])

  useEffect(() => {
    if (!locationId) return
    loadRequests(locationId).catch(err => toast.error(err.message || 'Failed to load requests'))
  }, [locationId, loadRequests])

  async function handleSubmit(e) {
    e.preventDefault()
    const n = parseFloat(qty)
    if (!productId) return toast.error(copy('Select a product', 'اختر منتجًا'))
    if (!locationId) return toast.error(copy('Select a branch', 'اختر فرعًا'))
    if (!n || n <= 0) return toast.error(copy('Enter a quantity above 0', 'أدخل كمية أكبر من صفر'))
    setSubmitting(true)
    try {
      await requestTransfer(productId, locationId, n, note.trim())
      toast.success(copy('Transfer requested', 'تم طلب التحويل'))
      setProductId('')
      setQty('')
      setNote('')
      await loadRequests(locationId)
    } catch (err) {
      toast.error(err.message || copy('Request failed', 'تعذر إرسال الطلب'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(t) {
    setCancelling(t.id)
    try {
      await cancelTransfer(t.id)
      toast.success(copy('Request cancelled', 'تم إلغاء الطلب'))
      await loadRequests(locationId)
    } catch (err) {
      toast.error(err.message || copy('Cancel failed', 'تعذر الإلغاء'))
    } finally {
      setCancelling(null)
    }
  }

  const selectedWarehouseQty = productId ? (warehouseQty[productId] ?? 0) : null
  const selectedProduct = products.find(product => product.id === productId)

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
              <PackagePlus size={18} className="text-noch-green" />
              {copy('Transfer Requests', 'طلبات التحويل')}
            </h1>
            <p className="text-noch-muted text-sm">{copy('Request stock from the central warehouse', 'اطلب مخزونًا من المستودع المركزي')}</p>
          </div>
        </div>

        {/* Request form */}
        <form onSubmit={handleSubmit} className="bg-noch-card border border-noch-border rounded-xl p-4 mb-6 space-y-3">
          <h2 className="text-white font-semibold text-sm">{copy('Request stock', 'طلب مخزون')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1">{copy('Destination branch', 'الفرع المستلم')}</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} className="input w-full">
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label block mb-1">{copy('Product', 'المنتج')}</label>
              <select value={productId} onChange={e => setProductId(e.target.value)} className="input w-full">
                <option value="">{copy('Select product…', 'اختر منتجًا…')}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {copy('warehouse', 'المستودع')}: {formatStockQuantity(warehouseQty[p.id] ?? 0, p.stock_display_unit)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">
                {copy('Quantity', 'الكمية')}{selectedProduct ? ` (${selectedProduct.stock_base_unit || 'pc'})` : ''}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                className="input w-full"
              />
              {selectedWarehouseQty !== null && (
                <p className={`text-xs mt-1 ${selectedWarehouseQty <= 0 ? 'text-red-400' : 'text-noch-muted'}`}>
                  {formatStockQuantity(selectedWarehouseQty, selectedProduct?.stock_display_unit)} {copy('available in warehouse', 'متاح في المستودع')}
                </p>
              )}
            </div>
            <div>
              <label className="label block mb-1">{copy('Note (optional)', 'ملاحظة (اختياري)')}</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. weekend rush"
                className="input w-full"
              />
            </div>
          </div>
          <button type="submit" disabled={submitting || loading} className="btn-primary flex items-center gap-2">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {copy('Request transfer', 'طلب تحويل')}
          </button>
        </form>

        {/* Open requests */}
        <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-noch-border">
            <h2 className="text-white font-semibold text-sm">
              {copy('Open requests', 'الطلبات المفتوحة')}{locationId ? ` — ${locationName(locationId)}` : ''}
            </h2>
          </div>
          {loading ? (
            <p className="text-noch-muted text-center py-10 text-sm">{copy('Loading…', 'جارٍ التحميل…')}</p>
          ) : openRequests.length === 0 ? (
            <p className="text-noch-muted text-center py-10 text-sm">{copy('No open requests for this branch', 'لا توجد طلبات مفتوحة لهذا الفرع')}</p>
          ) : (
            <div className="divide-y divide-noch-border/50">
              {openRequests.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{t.product_name}</p>
                    <p className="text-noch-muted text-xs">
                      {formatStockQuantity(t.qty_requested, t.stock_display_unit)} {copy('requested', 'مطلوب')}
                      {t.requested_at && ` · ${new Date(t.requested_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                      {t.note && ` · ${t.note}`}
                    </p>
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => handleCancel(t)}
                      disabled={cancelling === t.id}
                      className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 shrink-0"
                    >
                      {cancelling === t.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                      {copy('Cancel', 'إلغاء')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
