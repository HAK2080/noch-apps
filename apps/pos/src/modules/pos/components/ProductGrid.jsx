// ProductGrid.jsx — POS product selection grid.
//
// Image-hero layout: photo fills the top ~60% of the tile, dark card
// below with English name, Arabic name, price, and a thin category
// accent line. Optimised for fast visual scanning by Arabic-first
// café staff.

import { useState, useEffect, useMemo, useRef, memo } from 'react'
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

function ProductGrid({
  products = [], categories = [], onSelect, onLongPress,
  blockOutOfStock = false, searchQuery = '',
  tileLang = 'both',  // 'both' | 'en' | 'ar'
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
          Tiles are taller (h-[180px]/[200px]) to give the hero photo
          real estate while keeping name + Arabic + price below. */}
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
              className={`relative rounded-2xl text-left h-[180px] sm:h-[200px] flex flex-col overflow-hidden
                bg-noch-card border border-noch-border/40
                transition-transform duration-75
                ${unavailable
                  ? 'opacity-40 grayscale cursor-not-allowed'
                  : 'active:scale-[0.96] hover:brightness-110'}`}
            >
              {/* Status pill — top-right, sits over the photo */}
              {product.is_sold_out ? (
                <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 bg-red-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shadow-lg select-none">
                  <Ban size={10} /> Sold out
                </div>
              ) : isOutOfStock(product) ? (
                <div className="absolute top-1.5 right-1.5 z-20 bg-red-500/90 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shadow-lg">
                  Out
                </div>
              ) : isLowStock(product) ? (
                <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 bg-yellow-500/90 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shadow-lg">
                  <AlertTriangle size={10} /> Low
                </div>
              ) : null}

              {/* Hero photo — top ~60% of the tile. Falls back to a big
                  coloured monogram on the tinted bg when no image. */}
              <div
                className="flex-[3] relative overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: tint.bg }}
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span
                    className="text-4xl sm:text-5xl font-extrabold opacity-80"
                    style={{ color: tint.border }}
                  >
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Text card — bottom ~40%. Thin top accent line uses the
                  category colour so eyes can still group by colour. */}
              <div
                className="flex-[2] px-2.5 py-2 flex flex-col justify-between bg-noch-dark/95 border-t-2"
                style={{ borderTopColor: tint.border }}
              >
                <div className="min-h-0">
                  {tileLang !== 'ar' && (
                    <p className="text-white text-sm sm:text-[15px] font-semibold leading-tight line-clamp-1">
                      {product.name}
                    </p>
                  )}
                  {tileLang !== 'en' && product.name_ar && (
                    <p
                      className={`text-noch-muted leading-tight line-clamp-1 ${
                        tileLang === 'ar'
                          ? 'text-white text-sm sm:text-[15px] font-semibold'
                          : 'text-[12px] sm:text-[13px] mt-0.5'
                      }`}
                      dir="rtl"
                      lang="ar"
                    >
                      {product.name_ar}
                    </p>
                  )}
                  {/* Fallback when AR mode but no name_ar exists */}
                  {tileLang === 'ar' && !product.name_ar && (
                    <p className="text-white text-sm sm:text-[15px] font-semibold leading-tight line-clamp-1">
                      {product.name}
                    </p>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-1 mt-1">
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

export default memo(ProductGrid)
