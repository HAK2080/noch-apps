(function (root) {
  const departments = [
    { id: 'coffee', name: 'Coffee beans', name_ar: 'حبوب القهوة' },
    { id: 'tea', name: 'Matcha & tea', name_ar: 'الماتشا والشاي' },
    { id: 'grinders', name: 'Grinders', name_ar: 'المطاحن' },
    { id: 'brewing', name: 'Brewing & filters', name_ar: 'التحضير والفلاتر' },
    { id: 'espresso', name: 'Espresso tools', name_ar: 'أدوات الإسبريسو' },
    { id: 'milk', name: 'Milk pitchers', name_ar: 'أباريق الحليب' },
    { id: 'cups', name: 'Cups & glassware', name_ar: 'الأكواب والزجاجيات' },
    { id: 'scales', name: 'Scales & thermometers', name_ar: 'الموازين ومقاييس الحرارة' },
    { id: 'care', name: 'Cleaning & accessories', name_ar: 'التنظيف والإكسسوارات' },
    { id: 'other', name: 'Other essentials', name_ar: 'منتجات أخرى' },
  ]
  function department(product) {
    const name = `${product.name || ''} ${product.name_ar || ''}`.toLowerCase()
    if (product.is_coffee_bean || /brazil|colombia|colombe|ethiopia|costa rica|ghadamis|espresso blend|بلوم ايسبرسو|بن غدامس|لبدة/.test(name)) return 'coffee'
    if (/matcha|hojicha|tea\b|شاي|ماتشا/.test(name) && !/teapot|إبريق/.test(name)) return 'tea'
    if (/grinder|مطحنة|طاحونة/.test(name)) return 'grinders'
    if (/pitcher|إبريق حليب/.test(name)) return 'milk'
    if (/scale|thermometer|ميزان|مقياس حرارة/.test(name)) return 'scales'
    if (/tamper|distributor|dosing|knock box|tamping|مكبس|جرعات|تفل/.test(name)) return 'espresso'
    if (/rinser|brush|towel|cleaning|air blower|drying|tray|pad|فرشاة|منشفة/.test(name)) return 'care'
    if (/dripper|filter|kettle|moka|syphon|siphon|brewer|brew|server|teapot|pour.over|فلتر|فلاتر|غلاية/.test(name)) return 'brewing'
    if (/cup|mug|glass|tumbler|كوب|أكواب/.test(name)) return 'cups'
    return 'other'
  }
  function brand(product) {
    if (/timemore|تايمور/i.test(product.name || '')) return 'TIMEMORE'
    if (/3bom ber|3bomber/i.test(product.name || '')) return 'MHW-3BOMBER'
    return 'Other'
  }
  function inStock(product) { return !product.is_sold_out && product.is_available !== false && (!product.track_inventory || Number(product.stock_qty) > 0) }
  function filter(products, options = {}) {
    const words = String(options.search || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    return products.filter(product => {
      if (options.department && options.department !== 'all' && department(product) !== options.department) return false
      if (options.brand && options.brand !== 'all' && brand(product) !== options.brand) return false
      if (options.inStock && !inStock(product)) return false
      if (options.min !== '' && options.min != null && Number(product.price) < Number(options.min)) return false
      if (options.max !== '' && options.max != null && Number(product.price) > Number(options.max)) return false
      const haystack = `${product.sku || ''} ${product.name || ''} ${product.name_ar || ''} ${product.description || ''} ${product.menu_description || ''} ${product.menu_description_ar || ''}`.toLowerCase()
      return words.every(word => haystack.includes(word))
    })
  }
  root.NochRetail = { departments, department, brand, inStock, filter }
})(typeof window === 'undefined' ? globalThis : window)
