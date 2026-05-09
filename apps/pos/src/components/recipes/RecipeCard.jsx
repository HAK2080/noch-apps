import { useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import { ChevronRight, EyeOff, Eye } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'

const CATEGORY_INFO = {
  matcha: { label_en: 'Matcha Line', label_ar: 'خط الماتشا', color: '#4A7C59', accent: 'text-emerald-400' },
  coffee: { label_en: 'Coffee Line', label_ar: 'خط القهوة', color: '#8B6F47', accent: 'text-amber-400' },
  specialty: { label_en: 'Specialty', label_ar: 'مشروبات مميزة', color: '#9B59B6', accent: 'text-purple-400' },
  signature: { label_en: 'Signature', label_ar: 'مشروبات خاصة', color: '#3498DB', accent: 'text-blue-400' },
}

const LONG_PRESS_MS = 700

export default function RecipeCard({ recipe, canManage = false, onToggleDisabled }) {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const [pressing, setPressing] = useState(false)

  const name = lang === 'ar' && recipe.name_ar ? recipe.name_ar : recipe.name
  const categoryInfo = CATEGORY_INFO[recipe.category] || CATEGORY_INFO.specialty
  const categoryLabel = lang === 'ar' ? categoryInfo.label_ar : categoryInfo.label_en
  const disabled = !!recipe.is_archived

  const startPress = (e) => {
    if (!canManage) return
    longPressFired.current = false
    setPressing(true)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setPressing(false)
      // haptic on devices that support it
      try { if (navigator.vibrate) navigator.vibrate(40) } catch { /* noop */ }
      onToggleDisabled?.(recipe)
    }, LONG_PRESS_MS)
  }

  const cancelPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = null
    setPressing(false)
  }

  const handleClick = (e) => {
    // If long-press fired, swallow the click so we don't navigate.
    if (longPressFired.current) {
      longPressFired.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    navigate(`/recipes/${recipe.id}`)
  }

  return (
    <div
      onClick={handleClick}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => { if (canManage) e.preventDefault() }}
      className={`group cursor-pointer transition-all duration-300 hover:shadow-lg select-none relative ${
        disabled ? 'opacity-40 saturate-50' : ''
      } ${pressing ? 'scale-[0.985]' : ''}`}
      style={{ transition: 'opacity 200ms, transform 120ms, filter 200ms' }}
    >
      {/* Disabled badge — bottom-right pill */}
      {disabled && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/70 border border-noch-border text-noch-muted rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider pointer-events-none">
          <EyeOff size={10} />
          <span>{lang === 'ar' ? 'معطّل' : 'Disabled'}</span>
        </div>
      )}

      {/* Long-press progress hint — bar grows from 0 to full width over LONG_PRESS_MS */}
      {pressing && canManage && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-noch-green/20 overflow-hidden rounded-b-lg pointer-events-none">
          <div
            className="h-full bg-noch-green"
            style={{
              width: '100%',
              transformOrigin: 'left',
              animation: `recipeLongpress ${LONG_PRESS_MS}ms linear forwards`,
            }}
          />
        </div>
      )}
      {/* Inline keyframes — scoped, no global CSS edit */}
      <style>{`@keyframes recipeLongpress { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>

      {/* Card container */}
      <div className={`bg-noch-card border rounded-lg p-4 transition-colors ${
        disabled ? 'border-noch-border/50' : 'border-noch-border hover:border-noch-green/50'
      }`}>

        {/* Thumbnail — drink image if available, layer swatches as fallback */}
        {recipe.image_url ? (
          <div className="mb-4 rounded-lg overflow-hidden border border-noch-border/50 h-40">
            <img
              src={recipe.image_url}
              alt={name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        ) : recipe.layers?.length > 0 ? (
          <div className="mb-4 rounded-lg overflow-hidden border border-noch-border/50">
            <div className="flex h-24 gap-0.5 bg-noch-dark p-1">
              {recipe.layers.map((layer, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm relative group/layer"
                  style={{ backgroundColor: layer.color || '#333' }}
                  title={lang === 'ar' ? layer.label_ar : layer.label}
                >
                  <div className="opacity-0 group-hover/layer:opacity-100 absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity text-xs text-white font-medium text-center px-1">
                    {lang === 'ar' ? layer.label_ar : layer.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Recipe code and category */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1">
            {/* Code badge */}
            <div className="text-xs font-mono font-bold text-white tracking-wider mb-2">
              {recipe.code}
            </div>

            {/* Category label */}
            <div className={`inline-block text-xs font-semibold px-2 py-1 rounded-full mb-2 ${categoryInfo.accent}`}>
              {categoryLabel}
              {recipe.subcategory && (
                <span className="opacity-70 ms-1">
                  •{' '}
                  {recipe.subcategory.charAt(0).toUpperCase() + recipe.subcategory.slice(1)}
                </span>
              )}
            </div>

            {/* Recipe name */}
            <h3 className="text-white font-bold text-base leading-tight mb-1">
              {name}
            </h3>
          </div>
        </div>

        {/* Description snippet */}
        {recipe.description && (
          <p className="text-xs text-noch-muted line-clamp-2 mb-3">
            {lang === 'ar' && recipe.description_ar ? recipe.description_ar : recipe.description}
          </p>
        )}

        {/* Recipe details */}
        <div className="space-y-2 text-xs text-noch-muted mb-3 pb-3 border-t border-noch-border/30 pt-3">
          {recipe.glass_type && (
            <div className="flex justify-between">
              <span>{lang === 'ar' ? 'الكوب' : 'Glass'}</span>
              <span className="text-white font-medium">
                {lang === 'ar' && recipe.glass_type_ar ? recipe.glass_type_ar : recipe.glass_type}
              </span>
            </div>
          )}
          {recipe.yield_ml && (
            <div className="flex justify-between">
              <span>{lang === 'ar' ? 'الحجم' : 'Volume'}</span>
              <span className="text-white font-medium">{recipe.yield_ml} ml</span>
            </div>
          )}
          {recipe.ingredients?.length > 0 && (
            <div className="flex justify-between">
              <span>{lang === 'ar' ? 'المكونات' : 'Ingredients'}</span>
              <span className="text-white font-medium">
                {recipe.ingredients.reduce((acc, g) => acc + (g.items?.length || 0), 0)} items
              </span>
            </div>
          )}
        </div>

        {/* Action button — re-enable when disabled, view when active */}
        {disabled && canManage ? (
          <div className="w-full bg-noch-green/10 border border-noch-green/30 text-noch-green rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-2 px-3">
            <Eye size={14} />
            <span>{lang === 'ar' ? 'اضغط مطوّلاً للتفعيل' : 'Long-press to re-enable'}</span>
          </div>
        ) : (
          <button className="w-full bg-noch-green/10 border border-noch-green/30 text-noch-green rounded-lg py-2 text-xs font-semibold flex items-center justify-between px-3 group-hover:bg-noch-green/20 group-hover:border-noch-green/50 transition-colors">
            <span>{lang === 'ar' ? 'عرض الوصفة' : 'View Recipe'}</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>
    </div>
  )
}
