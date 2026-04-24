// ProductGrid.jsx — Product selection grid for POS terminal

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function ProductGrid({ products = [], categories = [], onSelect, searchQuery = '' }) {
  const [activeCategory, setActiveCategory] = useState('all')

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
            onClick={() => onSelect(product)}
            className="relative bg-noch-card border border-noch-border rounded-xl text-left
              hover:border-noch-green/50 hover:bg-noch-green/5 active:scale-95 transition-all
              min-h-[80px] flex flex-col justify-between overflow-hidden"
          >
            {/* Product image background */}
            {product.image_url ? (
              <div className="absolute inset-0 z-0">
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover opacity-30" />
                <div className="absolute inset-0 bg-gradient-to-t from-noch-dark/90 to-transparent" />
              </div>
            ) : null}

            <div className="relative z-10 p-3 flex flex-col justify-between h-full">
              {/* Low stock badge */}
              {isLowStock(product) && (
                <div className="absolute top-0 right-0">
                  <AlertTriangle size={12} className="text-yellow-400" />
                </div>
              )}

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
