// WarehouseStock.jsx — Central warehouse product stock + receive form
// Route: /inventory/warehouse
// Stock enters via receive_warehouse_stock (this form) and leaves via
// ship_transfer (see Transfers page).

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Warehouse, RefreshCw, Search, PackagePlus } from 'lucide-react'
import Layout from '../../components/Layout'
import { listWarehouseStock, listProducts, receiveWarehouseStock } from './lib/warehouse'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatStockQuantity, toBaseQuantity } from '../../modules/pos/lib/inventory-units'
import toast from 'react-hot-toast'

export default function WarehouseStock() {
  const navigate = useNavigate()
  const { profile, isOwner } = useAuth()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const canReceive = isOwner || profile?.role === 'supervisor'
  const [warehouse, setWarehouse] = useState(null)
  const [rows, setRows] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ productId: '', qty: '', note: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([listWarehouseStock(), listProducts()])
      .then(([stockResult, productRows]) => {
        if (!active) return
        setWarehouse(stockResult.warehouse)
        setRows(stockResult.rows)
        setProducts(productRows)
        setLoading(false)
      })
      .catch(error => {
        if (!active) return
        toast.error(error.message || (arabic ? 'تعذر تحميل مخزون المستودع' : 'Failed to load warehouse stock'))
        setLoading(false)
      })
    return () => { active = false }
  }, [arabic])

  async function load() {
    setLoading(true)
    try {
      const [{ warehouse, rows }, prods] = await Promise.all([listWarehouseStock(), listProducts()])
      setWarehouse(warehouse)
      setRows(rows)
      setProducts(prods)
    } catch (err) {
      toast.error(err.message || copy('Failed to load warehouse stock', 'تعذر تحميل مخزون المستودع'))
    } finally {
      setLoading(false)
    }
  }

  async function submitReceive(e) {
    e.preventDefault()
    const qty = parseFloat(form.qty)
    const product = products.find(item => item.id === form.productId)
    if (!form.productId) { toast.error(copy('Select a product', 'اختر منتجًا')); return }
    if (!qty || qty <= 0) { toast.error(copy('Enter a valid quantity', 'أدخل كمية صحيحة')); return }
    setSaving(true)
    try {
      const baseQty = toBaseQuantity(qty, product?.stock_display_unit || product?.stock_base_unit || 'pc')
      await receiveWarehouseStock(form.productId, baseQty, form.note)
      toast.success(copy('Stock received into warehouse', 'تم استلام المخزون في المستودع'))
      setForm({ productId: '', qty: '', note: '' })
      load()
    } catch (err) {
      toast.error(err.message || copy('Failed to receive stock', 'تعذر استلام المخزون'))
    } finally {
      setSaving(false)
    }
  }

  const filtered = rows.filter(r =>
    !search || r.product_name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedProduct = products.find(product => product.id === form.productId)

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
              <Warehouse size={18} className="text-noch-green" />
              {copy('Warehouse Stock', 'مخزون المستودع')}
            </h1>
            <p className="text-noch-muted text-sm">{warehouse?.name || 'Central Warehouse'}</p>
          </div>
          <button onClick={load} className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Receive stock (owner/supervisor) */}
        {canReceive && (
          <form onSubmit={submitReceive} className="bg-noch-card border border-noch-border rounded-xl p-4 mb-4">
            <p className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
              <PackagePlus size={15} className="text-noch-green" /> {copy('Receive stock into warehouse', 'استلام مخزون في المستودع')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_1fr_auto] gap-2">
              <select
                value={form.productId}
                onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                className="input"
              >
                <option value="">{copy('Select product…', 'اختر منتجًا…')}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} · {p.stock_display_unit || p.stock_base_unit || 'pc'}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                placeholder={`Qty${selectedProduct ? ` (${selectedProduct.stock_display_unit || selectedProduct.stock_base_unit || 'pc'})` : ''}`}
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                className="input"
              />
              <input
                type="text"
                placeholder={copy('Note (optional)', 'ملاحظة (اختياري)')}
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="input"
              />
              <button type="submit" disabled={saving} className="btn-primary whitespace-nowrap disabled:opacity-50">
                {saving ? copy('Saving…', 'جارٍ الحفظ…') : copy('Receive', 'استلام')}
              </button>
            </div>
          </form>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input
            type="text"
            placeholder={copy('Search products…', 'ابحث عن المنتجات…')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full pl-9"
          />
        </div>

        {/* Table */}
        <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_110px_150px] gap-2 px-4 py-2.5 border-b border-noch-border text-xs font-semibold text-noch-muted uppercase tracking-wide">
            <span>{copy('Product', 'المنتج')}</span>
            <span className="text-right">{copy('Qty', 'الكمية')}</span>
            <span className="text-right">{copy('Value', 'القيمة')}</span>
            <span className="text-right">{copy('Updated', 'آخر تحديث')}</span>
          </div>
          {loading ? (
            <p className="text-noch-muted text-center py-10 text-sm">{copy('Loading…', 'جارٍ التحميل…')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-noch-muted text-center py-10 text-sm">
              {rows.length === 0
                ? copy('No warehouse stock yet — receive stock above, then ship it to branches', 'لا يوجد مخزون في المستودع بعد — استلم المخزون أعلاه ثم أرسله إلى الفروع')
                : copy('No products match', 'لا توجد منتجات مطابقة')}
            </p>
          ) : (
            <div className="divide-y divide-noch-border/50">
              {filtered.map(r => (
                <div key={r.id} className="grid grid-cols-[1fr_100px_110px_150px] gap-2 px-4 py-3 items-center">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{r.product_name}</p>
                    {r.stock_cost_per_base_unit > 0 && <p className="text-noch-muted text-[11px]">{r.stock_cost_per_base_unit.toFixed(5)} LYD/{r.stock_base_unit}</p>}
                  </div>
                  <p className={`text-sm font-bold text-right tabular-nums ${parseFloat(r.qty) <= 0 ? 'text-red-400' : 'text-noch-green'}`}>
                    {formatStockQuantity(r.qty, r.stock_display_unit)}
                  </p>
                  <p className="text-white text-xs text-right tabular-nums">{r.stock_value > 0 ? `${r.stock_value.toFixed(2)} LYD` : '—'}</p>
                  <p className="text-noch-muted text-xs text-right">
                    {r.updated_at ? new Date(r.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-noch-muted text-xs mt-3">
          {copy('Stock enters here through receiving and leaves through audited transfers.', 'يدخل المخزون هنا عبر الاستلام ويخرج عبر تحويلات مسجلة.')}
        </p>
      </div>
    </Layout>
  )
}
