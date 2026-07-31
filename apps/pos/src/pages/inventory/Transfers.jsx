import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, Loader2, PackageCheck, RefreshCw, Truck } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatStockQuantity } from '../../modules/pos/lib/inventory-units'
import { listLocations, listTransfers, receiveTransfer, shipTransfer } from './lib/warehouse'
import toast from 'react-hot-toast'

const STATUS_META = {
  requested: { en: 'Requested', ar: 'مطلوب', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  shipped: { en: 'Shipped', ar: 'مشحون', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  received: { en: 'Received', ar: 'مستلم', cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
  partial: { en: 'Partial', ar: 'جزئي', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  cancelled: { en: 'Cancelled', ar: 'ملغي', cls: 'bg-noch-card text-noch-muted border-noch-border' },
}

function StatusBadge({ status, arabic }) {
  const meta = STATUS_META[status] || STATUS_META.cancelled
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>
      {arabic ? meta.ar : meta.en}
    </span>
  )
}

function ShipRow({ transfer, locationName, onShip, copy }) {
  const [qty, setQty] = useState(String(parseFloat(transfer.qty_requested)))
  const [busy, setBusy] = useState(false)

  const handleShip = async () => {
    const value = parseFloat(qty)
    if (!value || value <= 0) return toast.error(copy('Enter a quantity above 0', 'أدخل كمية أكبر من صفر'))
    setBusy(true)
    try {
      await onShip(transfer.id, value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{transfer.product_name}</p>
        <p className="text-noch-muted text-xs">
          → {locationName(transfer.to_location_id)} · {copy('requested', 'المطلوب')} {formatStockQuantity(transfer.qty_requested, transfer.stock_display_unit)}
          {transfer.note && ` · ${transfer.note}`}
        </p>
      </div>
      <input
        type="number"
        min="0"
        step="0.01"
        value={qty}
        onChange={event => setQty(event.target.value)}
        className="input py-1 px-2 w-20 text-sm text-center shrink-0"
      />
      <button onClick={handleShip} disabled={busy} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shrink-0">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}
        {copy('Ship', 'شحن')}
      </button>
    </div>
  )
}

function ReceiveRow({ transfer, locationName, onReceive, copy }) {
  const shipped = parseFloat(transfer.qty_shipped) || 0
  const [qty, setQty] = useState(String(shipped))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const arrived = parseFloat(qty)
  const isShort = Number.isFinite(arrived) && arrived < shipped

  const handleReceive = async () => {
    if (!Number.isFinite(arrived) || arrived < 0) {
      return toast.error(copy('Enter the arrived quantity', 'أدخل الكمية الواصلة'))
    }
    if (isShort && !reason.trim()) {
      return toast.error(copy('A discrepancy reason is required', 'سبب الفرق مطلوب'))
    }
    setBusy(true)
    try {
      await onReceive(transfer.id, arrived, reason.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{transfer.product_name}</p>
          <p className="text-noch-muted text-xs">
            → {locationName(transfer.to_location_id)} · {copy('shipped', 'المشحون')} {formatStockQuantity(shipped, transfer.stock_display_unit)}
          </p>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          value={qty}
          onChange={event => setQty(event.target.value)}
          className="input py-1 px-2 w-20 text-sm text-center shrink-0"
        />
        <button onClick={handleReceive} disabled={busy} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shrink-0">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <PackageCheck size={12} />}
          {copy('Receive', 'استلام')}
        </button>
      </div>
      {isShort && (
        <input
          type="text"
          value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder={copy('Why did less arrive? (required)', 'لماذا وصلت كمية أقل؟ (مطلوب)')}
          className="input w-full py-1.5 text-sm border-orange-500/40"
        />
      )}
    </div>
  )
}

export default function Transfers() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const canShip = profile?.role === 'owner' || profile?.role === 'supervisor'
  const [locations, setLocations] = useState([])
  const [toShip, setToShip] = useState([])
  const [toReceive, setToReceive] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const locationName = id => {
    const location = locations.find(item => item.id === id)
    return (arabic ? location?.name_ar || location?.name : location?.name) || '—'
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [locationRows, requested, shipped, recent] = await Promise.all([
        listLocations(),
        listTransfers({ status: 'requested', limit: 100 }),
        listTransfers({ status: 'shipped', limit: 100 }),
        listTransfers({ limit: 50 }),
      ])
      setLocations(locationRows)
      setToShip(requested)
      setToReceive(shipped)
      setHistory(recent)
    } catch (error) {
      toast.error(error.message || (arabic ? 'تعذر تحميل التحويلات' : 'Failed to load transfers'))
    } finally {
      setLoading(false)
    }
  }, [arabic])

  useEffect(() => {
    let active = true
    Promise.all([
      listLocations(),
      listTransfers({ status: 'requested', limit: 100 }),
      listTransfers({ status: 'shipped', limit: 100 }),
      listTransfers({ limit: 50 }),
    ]).then(([locationRows, requested, shipped, recent]) => {
      if (!active) return
      setLocations(locationRows)
      setToShip(requested)
      setToReceive(shipped)
      setHistory(recent)
      setLoading(false)
    }).catch(error => {
      if (!active) return
      toast.error(error.message || (arabic ? 'تعذر تحميل التحويلات' : 'Failed to load transfers'))
      setLoading(false)
    })
    return () => { active = false }
  }, [arabic])

  const handleShip = async (id, qty) => {
    try {
      await shipTransfer(id, qty)
      toast.success(copy('Transfer shipped', 'تم شحن التحويل'))
      await load()
    } catch (error) {
      toast.error(error.message || copy('Ship failed', 'تعذر الشحن'))
    }
  }

  const handleReceive = async (id, qtyReceived, reason) => {
    try {
      await receiveTransfer(id, qtyReceived, reason)
      toast.success(copy('Transfer received', 'تم استلام التحويل'))
      await load()
    } catch (error) {
      toast.error(error.message || copy('Receive failed', 'تعذر الاستلام'))
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/inventory')} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <ArrowRightLeft size={18} className="text-noch-green" />
              {copy('Transfers', 'التحويلات')}
            </h1>
            <p className="text-noch-muted text-sm">{copy('Ship from warehouse, receive at branch', 'اشحن من المستودع واستلم في الفرع')}</p>
          </div>
          <button onClick={load} className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card" title={copy('Refresh', 'تحديث')}>
            <RefreshCw size={16} />
          </button>
        </div>

        {loading ? (
          <p className="text-noch-muted text-center py-16 text-sm">{copy('Loading…', 'جارٍ التحميل…')}</p>
        ) : (
          <div className="space-y-6">
            <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-noch-border flex items-center justify-between">
                <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Truck size={14} className="text-amber-400" /> {copy('To ship', 'بانتظار الشحن')}
                </h2>
                <span className="text-noch-muted text-xs">{toShip.length}</span>
              </div>
              {toShip.length === 0 ? (
                <p className="text-noch-muted text-center py-8 text-sm">{copy('Nothing waiting to ship', 'لا يوجد شيء بانتظار الشحن')}</p>
              ) : canShip ? (
                <div className="divide-y divide-noch-border/50">
                  {toShip.map(transfer => (
                    <ShipRow key={transfer.id} transfer={transfer} locationName={locationName} onShip={handleShip} copy={copy} />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-noch-border/50">
                  {toShip.map(transfer => (
                    <div key={transfer.id} className="px-4 py-3">
                      <p className="text-white text-sm font-medium truncate">{transfer.product_name}</p>
                      <p className="text-noch-muted text-xs">
                        → {locationName(transfer.to_location_id)} · {copy('requested', 'المطلوب')} {formatStockQuantity(transfer.qty_requested, transfer.stock_display_unit)}
                      </p>
                    </div>
                  ))}
                  <p className="text-noch-muted text-xs px-4 py-2 border-t border-noch-border/50">
                    {copy('Shipping is owner/supervisor only.', 'الشحن متاح للمالك أو المشرف فقط.')}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-noch-border flex items-center justify-between">
                <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                  <PackageCheck size={14} className="text-noch-green" /> {copy('To receive', 'بانتظار الاستلام')}
                </h2>
                <span className="text-noch-muted text-xs">{toReceive.length}</span>
              </div>
              {toReceive.length === 0 ? (
                <p className="text-noch-muted text-center py-8 text-sm">{copy('Nothing in transit to receive', 'لا يوجد شيء قيد النقل للاستلام')}</p>
              ) : (
                <div className="divide-y divide-noch-border/50">
                  {toReceive.map(transfer => (
                    <ReceiveRow key={transfer.id} transfer={transfer} locationName={locationName} onReceive={handleReceive} copy={copy} />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-noch-border">
                <h2 className="text-white font-semibold text-sm">{copy('Recent history', 'السجل الحديث')}</h2>
              </div>
              {history.length === 0 ? (
                <p className="text-noch-muted text-center py-8 text-sm">{copy('No transfers yet', 'لا توجد تحويلات بعد')}</p>
              ) : (
                <div className="divide-y divide-noch-border/50">
                  {history.map(transfer => (
                    <div key={transfer.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{transfer.product_name}</p>
                        <p className="text-noch-muted text-xs">
                          {locationName(transfer.from_location_id)} → {locationName(transfer.to_location_id)}
                          {' · '}{copy('requested', 'مطلوب')} {formatStockQuantity(transfer.qty_requested, transfer.stock_display_unit)}
                          {transfer.qty_shipped != null && ` · ${copy('shipped', 'مشحون')} ${formatStockQuantity(transfer.qty_shipped, transfer.stock_display_unit)}`}
                          {transfer.qty_received != null && ` · ${copy('received', 'مستلم')} ${formatStockQuantity(transfer.qty_received, transfer.stock_display_unit)}`}
                          {transfer.discrepancy_reason && ` · ${transfer.discrepancy_reason}`}
                        </p>
                      </div>
                      <StatusBadge status={transfer.status} arabic={arabic} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
