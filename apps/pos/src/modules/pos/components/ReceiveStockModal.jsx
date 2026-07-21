import { useState } from 'react'
import { Ban, CheckCircle2, PackagePlus, X } from 'lucide-react'
import {
  formatQuantityValue,
  formatStockQuantity,
  getCompatibleStockUnits,
  quickQuantitiesForUnit,
  toBaseQuantity,
} from '../lib/inventory-units'

export default function ReceiveStockModal({ product, onReceive, onToggleSoldOut, onClose }) {
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState(product?.stock_display_unit || product?.stock_base_unit || 'pc')
  const [saving, setSaving] = useState(false)
  const current = Number(product?.stock_qty) || 0
  const received = Number(quantity) || 0
  const receivedBase = toBaseQuantity(received, unit)
  const valid = Number.isFinite(received) && received > 0
  const displayUnit = product.track_inventory ? (product.stock_display_unit || unit) : unit
  const unitOptions = getCompatibleStockUnits(product.stock_base_unit || 'pc', !product.track_inventory && current === 0)
  const quickQuantities = quickQuantitiesForUnit(unit)

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onReceive(received, unit)
      onClose()
    } catch {
      // The terminal reports the error; keep the modal open for another try.
    } finally {
      setSaving(false)
    }
  }

  const toggleSoldOut = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onToggleSoldOut()
      onClose()
    } catch {
      // The terminal reports the error; keep the modal open for another try.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-noch-border">
          <div className="flex items-center gap-2 min-w-0">
            <PackagePlus size={18} className="text-noch-green shrink-0" />
            <div className="min-w-0">
              <h2 className="text-white font-bold">Receive Stock</h2>
              <p className="text-noch-muted text-sm truncate">{product.name}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1 text-noch-muted hover:text-white disabled:opacity-50">
            <X size={19} />
          </button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-noch-dark border border-noch-border rounded-xl p-3">
              <p className="text-noch-muted text-xs mb-1">Current stock</p>
              <p className="text-white text-xl font-bold">{formatStockQuantity(current, displayUnit)}</p>
            </div>
            <div className="bg-noch-green/10 border border-noch-green/30 rounded-xl p-3">
              <p className="text-noch-muted text-xs mb-1">New stock</p>
              <p className="text-noch-green text-xl font-bold">{formatStockQuantity(current + receivedBase, displayUnit)}</p>
            </div>
          </div>

          <label className="label block mb-2">Quantity received</label>
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <input
              type="number"
              min="0.001"
              step={unit === 'pc' ? '1' : unit === 'kg' || unit === 'l' ? '0.001' : '0.01'}
              inputMode="decimal"
              value={quantity}
              onChange={event => setQuantity(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') submit() }}
              className="input w-full text-xl font-bold text-center py-3"
              placeholder="0"
              autoFocus
            />
            <select value={unit} onChange={event => setUnit(event.target.value)} className="input w-full font-semibold">
              {unitOptions.map(option => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            {quickQuantities.map(value => (
              <button
                key={value}
                onClick={() => setQuantity(String(value))}
                className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  Number(quantity) === value
                    ? 'bg-noch-green/15 border-noch-green/50 text-noch-green'
                    : 'border-noch-border text-noch-muted hover:text-white'
                }`}
              >
                +{formatQuantityValue(value)}
              </button>
            ))}
          </div>

          {!product.track_inventory && (
            <p className="text-yellow-300 text-xs mt-3">
              Stock tracking will be enabled for this product.
            </p>
          )}

          <button
            onClick={submit}
            disabled={!valid || saving}
            className="btn-primary w-full py-3 mt-5 flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <CheckCircle2 size={17} />
            {saving ? 'Saving...' : `Confirm +${valid ? `${formatQuantityValue(received)} ${unitOptions.find(option => option.value === unit)?.shortLabel || unit}` : '0'}`}
          </button>

          <button
            onClick={toggleSoldOut}
            disabled={saving}
            className={`w-full py-2.5 mt-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40 ${
              product.is_sold_out
                ? 'border-noch-green/30 text-noch-green hover:bg-noch-green/10'
                : 'border-red-400/30 text-red-400 hover:bg-red-400/10'
            }`}
          >
            {product.is_sold_out ? <CheckCircle2 size={15} /> : <Ban size={15} />}
            {product.is_sold_out ? 'Mark Available' : 'Mark Sold Out'}
          </button>
        </div>
      </div>
    </div>
  )
}
