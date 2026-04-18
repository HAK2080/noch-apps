// CartPanel.jsx — Shopping cart for POS terminal

import { useState } from 'react'
import { Minus, Plus, X, Trash2, Tag } from 'lucide-react'
import { usePermission } from '../../../lib/usePermission'

function CartItem({ item, onUpdateQty, onRemove }) {
  const [editQty, setEditQty] = useState(false)
  const [qtyInput, setQtyInput] = useState(String(item.quantity))

  const handleQtyCommit = () => {
    const n = parseInt(qtyInput, 10)
    if (!isNaN(n) && n > 0) onUpdateQty(item.id, n)
    else setQtyInput(String(item.quantity))
    setEditQty(false)
  }

  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-noch-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{item.name}</p>
        {item.name_ar && (
          <p className="text-noch-muted text-xs text-right" dir="rtl">{item.name_ar}</p>
        )}
        {item.notes && (
          <p className="text-noch-muted text-xs italic mt-0.5">{item.notes}</p>
        )}
        <p className="text-noch-muted text-xs mt-0.5">
          {parseFloat(item.price).toFixed(2)} LYD each
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <p className="text-noch-green text-sm font-bold">
          {(parseFloat(item.price) * item.quantity).toFixed(2)}
        </p>

        <div className="flex items-center gap-1">
          <button
            onClick={() => item.quantity > 1 ? onUpdateQty(item.id, item.quantity - 1) : onRemove(item.id)}
            className="w-6 h-6 rounded-md bg-noch-border/50 flex items-center justify-center text-noch-muted hover:text-white active:scale-95"
          >
            <Minus size={10} />
          </button>

          {editQty ? (
            <input
              type="number"
              value={qtyInput}
              onChange={e => setQtyInput(e.target.value)}
              onBlur={handleQtyCommit}
              onKeyDown={e => e.key === 'Enter' && handleQtyCommit()}
              className="w-8 text-center text-sm text-white bg-noch-card border border-noch-green/50 rounded px-1 py-0.5"
              autoFocus
            />
          ) : (
            <button
              onClick={() => { setQtyInput(String(item.quantity)); setEditQty(true) }}
              className="w-7 text-center text-sm text-white font-semibold"
            >
              {item.quantity}
            </button>
          )}

          <button
            onClick={() => onUpdateQty(item.id, item.quantity + 1)}
            className="w-6 h-6 rounded-md bg-noch-green/20 flex items-center justify-center text-noch-green hover:bg-noch-green/40 active:scale-95"
          >
            <Plus size={10} />
          </button>

          <button
            onClick={() => onRemove(item.id)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-noch-muted hover:text-red-400 active:scale-95 ml-0.5"
          >
            <X size={10} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CartPanel({ items = [], onUpdateQty, onRemove, onDiscount, onClear, onCharge }) {
  const can = usePermission()
  const canDiscountAny = can('pos', 'discount_any')
  const canVoidOrder = can('pos', 'void_order')

  const [discountType, setDiscountType] = useState('pct') // 'pct' | 'flat'
  const [discountValue, setDiscountValue] = useState('10')
  const [showDiscount, setShowDiscount] = useState(false)

  const MAX_DISCOUNT_PCT = canDiscountAny ? Infinity : 10

  const handleDiscountTypeChange = (type) => {
    setDiscountType(type)
    setDiscountValue(type === 'pct' ? '10' : '')
  }

  const subtotal = items.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0)

  let discountAmount = 0
  if (discountValue) {
    if (discountType === 'pct') {
      const pct = Math.min(parseFloat(discountValue) || 0, MAX_DISCOUNT_PCT)
      discountAmount = subtotal * (pct / 100)
    } else {
      // flat cap: no more than MAX_DISCOUNT_PCT% of subtotal if not canDiscountAny
      const flatCap = canDiscountAny ? Infinity : subtotal * 0.10
      discountAmount = Math.min(parseFloat(discountValue) || 0, flatCap)
    }
  }
  const total = Math.max(0, subtotal - discountAmount)

  const handleApplyDiscount = () => {
    onDiscount({ type: discountType, value: parseFloat(discountValue) || 0, amount: discountAmount })
    setShowDiscount(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-white font-bold text-base">Cart</h2>
        {items.length > 0 && canVoidOrder && (
          <button
            onClick={onClear}
            className="text-noch-muted hover:text-red-400 flex items-center gap-1 text-xs transition-colors"
          >
            <Trash2 size={12} />
            Void
          </button>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-noch-muted text-sm">
            Add items to start
          </div>
        ) : (
          items.map(item => (
            <CartItem
              key={item.id}
              item={item}
              onUpdateQty={onUpdateQty}
              onRemove={onRemove}
            />
          ))
        )}
      </div>

      {/* Totals section */}
      {items.length > 0 && (
        <div className="shrink-0 border-t border-noch-border pt-3 mt-3">
          {/* Subtotal */}
          <div className="flex justify-between text-sm mb-1">
            <span className="text-noch-muted">Subtotal</span>
            <span className="text-white">{subtotal.toFixed(2)} LYD</span>
          </div>

          {/* Discount */}
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-noch-muted">Discount</span>
              <span className="text-yellow-400">-{discountAmount.toFixed(2)} LYD</span>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center mb-4">
            <span className="text-white font-bold text-lg">Total</span>
            <span className="text-noch-green font-bold text-2xl">{total.toFixed(2)} LYD</span>
          </div>

          {/* Discount toggle */}
          {showDiscount ? (
            <div className="flex flex-col gap-1.5 mb-3">
              {!canDiscountAny && (
                <p className="text-yellow-400 text-[10px]">Max discount: 10%</p>
              )}
              <div className="flex gap-2">
              <select
                value={discountType}
                onChange={e => handleDiscountTypeChange(e.target.value)}
                className="input py-1.5 px-2 text-sm w-20"
              >
                <option value="pct">%</option>
                <option value="flat">LYD</option>
              </select>
              <input
                type="number"
                placeholder={discountType === 'pct' ? '10' : '5.000'}
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                className="input py-1.5 px-2 text-sm flex-1"
                min="0"
                max={discountType === 'pct' && !canDiscountAny ? 10 : undefined}
              />
              <button onClick={handleApplyDiscount} className="btn-primary px-3 py-1.5 text-sm">
                Apply
              </button>
              <button onClick={() => { setShowDiscount(false); setDiscountValue(''); onDiscount({ type: 'pct', value: 0, amount: 0 }) }}
                className="btn-secondary px-2 py-1.5 text-sm">
                <X size={14} />
              </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDiscount(true)}
              className="flex items-center gap-1.5 text-noch-muted hover:text-white text-sm mb-3 transition-colors"
            >
              <Tag size={12} />
              Add discount
            </button>
          )}

          {/* Charge button */}
          <button
            onClick={() => onCharge({ subtotal, discountAmount, total, discountType, discountValue: parseFloat(discountValue) || 0 })}
            className="btn-primary w-full py-4 text-lg font-bold rounded-xl"
            disabled={items.length === 0}
          >
            Charge {total.toFixed(2)} LYD
          </button>
        </div>
      )}
    </div>
  )
}
