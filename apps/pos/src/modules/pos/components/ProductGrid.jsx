// ProductGrid.jsx — Product selection grid for POS terminal

import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Ban } from 'lucide-react'

const LONG_PRESS_MS = 500

export default function ProductGrid({
  products = [], categories = [], onSelect, onLongPress,
  blockOutOfStock = false, searchQuery = '',
}) {
  // Default to Matcha if it exists, else 'all'
  const [activeCategory, setActiveCategory] = useState('all')
  useEffect(() => {
    if (activeCategory !== 'all') return
    const matcha = categories.find(c => /matcha/i.test(c.name || '') || /ماتشا/.test(c.name_ar || ''))
    if (matcha) setActiveCategory(matcha.id)
  }, [categories])

  const filtered = products.filter(p => {
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.name_ar && p.name_ar.includes(searchQuery)) ||
      (p.barcode && p.barcode.includes(searchQuery))
    const matchCat = activeCategory === 'all' || p.category_id === activeCategory
    return matchSearch && matchCat
  })

  const isLowStock = (p) =>
    p.track_inventory &&
    parseFloat(p.stock_qty) <= parseFloat(p.low_stock_alert)

  // Out-of-stock = tracked + qty<=0. Visual cue is always shown; the
  // click is only blocked when blockOutOfStock prop is true (the
  // pos_settings.block_out_of_stock flag).
  const isOutOfStock = (p) =>
    p.track_inventory &&
    Number.isFinite(parseFloat(p.stock_qty)) &&
    parseFloat(p.stock_qty) <= 0

  const isUnavailable = (p) =>
    p.is_sold_out || (blockOutOfStock && isOutOfStock(p))

  // Long-press handlers — only fire onLongPress; tap fires onSelect.
  // Using refs+timeout instead of pointer events for broad compatibility.
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const startPress = (product) => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      if (onLongPress) onLongPress(product)
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  const handleClick = (product) => {
    if (longPressFired.current) {
      // Long press already handled — swallow the click.
      longPressFired.current = false
      return
    }
    if (isUnavailable(product)) return
    onSelect(product)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 scrollbar-hide">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
            activeCategory === 'all'
              ? 'bg-noch-green text-noch-dark'
              : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? 'text-noch-dark font-semibold'
                : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'
            }`}
            style={activeCategory === cat.id ? { backgroundColor: cat.color || '#10b981' } : {}}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-3 gap-2 overflow-y-auto flex-1 pt-2">
        {filtered.length === 0 && (
          <div className="col-span-3 text-center text-noch-muted py-12 text-sm">
            {searchQuery ? `No results for "${searchQuery}"` : 'No products'}
          </div>
        )}
        {filtered.map(product => (
          <button
            key={product.id}
            onClick={() => handleClick(product)}
            onMouseDown={() => startPress(product)}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onTouchStart={() => startPress(product)}
            onTouchEnd={cancelPress}
            onTouchCancel={cancelPress}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isUnavailable(product)}
            className={`relative bg-noch-card border border-noch-border rounded-xl text-left
              transition-all min-h-[80px] flex flex-col justify-between overflow-hidden
              ${isUnavailable(product)
                ? 'opacity-50 grayscale cursor-not-allowed'
                : 'hover:border-noch-green/50 hover:bg-noch-green/5 active:scale-95'}`}
          >
            {/* Product image background */}
            {product.image_url ? (
              <div className="absolute inset-0 z-0">
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover opacity-30" />
                <div className="absolute inset-0 bg-gradient-to-t from-noch-dark/90 to-transparent" />
              </div>
            ) : null}

            <div className="relative z-10 p-3 flex flex-col justify-between h-full">
              {/* Sold-out / out-of-stock / low-stock indicator */}
              {product.is_sold_out ? (
                <div className="absolute top-0 right-0 flex items-center gap-1 bg-red-500/90 text-white text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-bl">
                  <Ban size={10} /> Sold out
                </div>
              ) : isOutOfStock(product) ? (
                <div className="absolute top-0 right-0 bg-red-500/80 text-white text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-bl">
                  Out of stock
                </div>
              ) : isLowStock(product) ? (
                <div className="absolute top-0 right-0">
                  <AlertTriangle size={12} className="text-yellow-400" />
                </div>
              ) : null}

              {/* No image: show first letter avatar */}
              {!product.image_url && (
                <div className="w-8 h-8 rounded-lg bg-noch-green/10 flex items-center justify-center mb-1 text-noch-green text-sm font-bold">
                  {product.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div>
                <p className="text-white text-sm font-semibold leading-tight line-clamp-2">
                  {product.name}
                </p>
                {product.name_ar && (
                  <p className="text-noch-muted text-xs mt-0.5 text-right" dir="rtl">
                    {product.name_ar}
                  </p>
                )}
              </div>

              <p className="text-noch-green text-sm font-bold mt-1">
                {parseFloat(product.price).toFixed(2)} LYD
              </p>

              {/* Category color dot */}
              {product.pos_categories?.color && (
                <div
                  className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: product.pos_categories.color }}
                />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
