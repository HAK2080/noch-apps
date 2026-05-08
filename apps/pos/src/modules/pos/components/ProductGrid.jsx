// ProductGrid.jsx — POS product selection grid.
//
// Redesigned 2026-05-08 for go-live. Design priorities:
//   1. Big tappable targets (110-140px). Café tablets get hit fast.
//   2. Name + price both readable from arm's length under café lights.
//   3. Category color drives the LEFT BORDER (not a tiny dot) so eyes
//      sort by colour without reading.
//   4. Image is either a clean thumbnail (small, full opacity) OR a
//      coloured initial — no 30%-opacity ghost images.
//   5. Status pills (sold out / low stock) sit OUTSIDE the name area
//      so the name never gets clipped.
//   6. Active state is a press-shrink, not a hover-glow — feels solid
//      under thumb.

import { useState, useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, Ban } from 'lucide-react'

const LONG_PRESS_MS = 500

// Map category color to a soft tinted tile bg + readable text colour.
// Falls back to noch-green for any category without a color set.
function tintFor(hex) {
  const c = hex || '#10b981'
  return {
    border: c,
    bg:     `${c}14`,   // 8% alpha tile background
    bgDeep: `${c}22`,   // 13% — header strip if we want one later
  }
}

export default function ProductGrid({
  products = [], categories = [], onSelect, onLongPress,
  blockOutOfStock = false, searchQuery = '',
}) {
  const [activeCategory, setActiveCategory] = useState('all')
  useEffect(() => {
    if (activeCategory !== 'all') return
    const matcha = categories.find(c => /matcha/i.test(c.name || '') || /ماتشا/.test(c.name_ar || ''))
    if (matcha) setActiveCategory(matcha.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  // Build a quick id→category map so we can colour-key any product
  // even when the category strip isn't visible.
  const catById = useMemo(() => {
    const m = {}
    for (const c of categories) m[c.id] = c
    return m
  }, [categories])

  const filtered = useMemo(() => products.filter(p => {
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.name_ar && p.name_ar.includes(searchQuery)) ||
      (p.barcode && p.barcode.includes(searchQuery))
    const matchCat = activeCategory === 'all' || p.category_id === activeCategory
    return matchSearch && matchCat
  }), [products, searchQuery, activeCategory])

  const isLowStock = (p) =>
    p.track_inventory && parseFloat(p.stock_qty) <= parseFloat(p.low_stock_alert)
  const isOutOfStock = (p) =>
    p.track_inventory && Number.isFinite(parseFloat(p.stock_qty)) && parseFloat(p.stock_qty) <= 0
  const isUnavailable = (p) => p.is_sold_out || (blockOutOfStock && isOutOfStock(p))

  // Long-press
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
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  const handleClick = (product) => {
    if (longPressFired.current) { longPressFired.current = false; return }
    if (isUnavailable(product)) return
    onSelect(product)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs — fatter targets, colour swatches */}
      <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 scrollbar-hide">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
            activeCategory === 'all'
              ? 'bg-noch-green text-noch-dark'
              : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'
          }`}
        >
          All ({products.length})
        </button>
        {categories.map(cat => {
          const active = activeCategory === cat.id
          const c = cat.color || '#10b981'
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                active ? 'text-white' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'
              }`}
              style={active ? { backgroundColor: c, borderColor: c } : {}}
            >
              {!active && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c }} />}
              {cat.name}
            </button>
          )
        })}
      </div>

      {/* Product grid — 2 cols on phones, 3 on tablets, 4 on desktop.
          Each tile fixed-height (h-[120px] sm:h-[136px]) for visual rhythm. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 overflow-y-auto flex-1 pt-2 pb-3">
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-noch-muted py-16 text-sm">
            {searchQuery ? `No results for "${searchQuery}"` : 'No products in this category'}
          </div>
        )}
        {filtered.map(product => {
          const cat = product.category_id ? catById[product.category_id] : null
          const tint = tintFor(cat?.color)
          const unavailable = isUnavailable(product)

          return (
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
              disabled={unavailable}
              className={`relative rounded-xl text-left h-[120px] sm:h-[136px] flex flex-col overflow-hidden
                transition-transform duration-75
                ${unavailable
                  ? 'opacity-40 grayscale cursor-not-allowed'
                  : 'active:scale-[0.96] hover:brightness-110'}`}
              style={{
                backgroundColor: tint.bg,
                borderLeft: `4px solid ${tint.border}`,
                borderTop: '1px solid rgba(255,255,255,0.05)',
                borderRight: '1px solid rgba(255,255,255,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {/* Status pill — top-right, never overlaps name area */}
              {product.is_sold_out ? (
                <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 bg-red-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                  <Ban size={10} /> Sold out
                </div>
              ) : isOutOfStock(product) ? (
                <div className="absolute top-1.5 right-1.5 z-20 bg-red-500/85 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                  Out
                </div>
              ) : isLowStock(product) ? (
                <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 bg-yellow-500/85 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                  <AlertTriangle size={10} /> Low
                </div>
              ) : null}

              {/* Image: small thumbnail in the top-left so the name has full
                  width below; falls back to a coloured monogram. */}
              <div className="flex items-start gap-2 px-2.5 pt-2.5 pb-1">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt=""
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover bg-black/20 shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center shrink-0 text-white text-xl font-bold"
                    style={{ backgroundColor: tint.border }}
                  >
                    {product.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name + price */}
              <div className="px-2.5 pb-2 mt-auto">
                <p className="text-white text-sm sm:text-[15px] font-semibold leading-tight line-clamp-2 mb-1">
                  {product.name}
                </p>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-white font-bold text-base sm:text-lg leading-none">
                    {parseFloat(product.price).toFixed(2)}
                  </span>
                  <span className="text-noch-muted text-[10px] uppercase tracking-wide">LYD</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
