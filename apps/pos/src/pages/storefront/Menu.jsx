import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import nochLogo from '../../assets/noch-logo.png'
import './styles/Menu.css'

// ── Custom inline SVGs for categories that need brand colors ────────────────
function MatchaIcedIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: '-3px' }}>
      <line x1="15" y1="2" x2="15" y2="10" stroke="#0B1020" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M7 8 L17 8 L15.5 21 L8.5 21 Z" fill="#7BB661" stroke="#0B1020" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M7 8 L17 8 L16.6 11.5 L7.4 11.5 Z" fill="#fff" stroke="#0B1020" strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  )
}
function V60Icon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: '-3px' }}>
      {/* Cone dripper */}
      <path d="M5 5 L19 5 L13.5 14 L10.5 14 Z" fill="#E86A1E" stroke="#0B1020" strokeWidth="1.6" strokeLinejoin="round"/>
      {/* Server below */}
      <rect x="8" y="14" width="8" height="6" rx="1" fill="#fff" stroke="#0B1020" strokeWidth="1.6"/>
      {/* Drip */}
      <line x1="12" y1="14" x2="12" y2="17" stroke="#6B4423" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function CatIcon({ name, imageUrl }) {
  if (imageUrl) return <img src={imageUrl} alt={name} style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', display: 'inline-block', verticalAlign: '-3px' }} />
  const n = (name || '').toLowerCase()
  if (/matcha|ماتشا/.test(n) && !/coffee/.test(n)) return <MatchaIcedIcon />
  if (/tools|tool|equipment|أدوات|معدات|v60/.test(n)) return <V60Icon />
  return <span>{catEmoji(name)}</span>
}

// ── Auto-emoji for category names (EN + AR) ──────────────────────────────────
// Order matters: iced/specific variants checked BEFORE broad keywords.
function catEmoji(name = '') {
  const n = name.toLowerCase()
  // Specific iced variants first
  if (/iced.*coffee|coffee.*iced|قهوة.*مثلج|مثلج.*قهوة/.test(n)) return '🥤'
  if (/iced.*tea|tea.*iced|شاي.*مثلج|مثلج.*شاي/.test(n)) return '🍹'
  if (/iced.*matcha|matcha.*iced/.test(n)) return '🥤'
  // Tools / equipment
  if (/tools|tool|equipment|أدوات|معدات/.test(n)) return '🧰'
  // Others / misc
  if (/others|other|misc|أخرى|متنوع/.test(n)) return '💧'
  // Matcha (default to iced look — most cafés serve iced)
  if (/matcha|ماتشا/.test(n)) return '🥤'
  if (/coffee|قهوة|espresso|latte|cappuccino|كابتشينو|لاتيه/.test(n)) return '☕'
  if (/tea|شاي|herbal|أعشاب/.test(n)) return '🫖'
  if (/sweet|حلو|dessert|cake|pastry|كيك|حلوى|حلويات|cookie|brownie/.test(n)) return '🍩'
  if (/waffle|وافل/.test(n)) return '🧇'
  if (/sandwich|ساندويتش|wrap|toast|توست/.test(n)) return '🥪'
  if (/food|أكل|meal|breakfast|وجبة|فطور|lunch/.test(n)) return '🍽️'
  if (/shake|شيك|smoothie|سموذي/.test(n)) return '🥤'
  if (/cold|بارد|iced|مثلج/.test(n)) return '🧊'
  if (/juice|عصير/.test(n)) return '🍋'
  if (/chocolate|شوكولاتة|choco/.test(n)) return '🍫'
  if (/hot|ساخن|warm/.test(n)) return '🔥'
  if (/fruit|فاكهة/.test(n)) return '🍓'
  if (/snack|بسكويت/.test(n)) return '🍿'
  return '🌿'
}

// ── Placeholder card colours (one per category, cycling) ────────────────────
const CARD_COLORS = [
  { bg: '#e8f5f0', text: '#1a7f64' },
  { bg: '#fff3e0', text: '#c85e00' },
  { bg: '#f3e5f5', text: '#7b1fa2' },
  { bg: '#e3f2fd', text: '#1565c0' },
  { bg: '#fce4ec', text: '#c62828' },
  { bg: '#f9fbe7', text: '#558b2f' },
  { bg: '#fff8e1', text: '#e65100' },
  { bg: '#e0f7fa', text: '#00695c' },
]

export default function Menu() {
  const { branchId } = useParams()
  const [searchParams] = useSearchParams()
  const tableNumber = searchParams.get('table')

  const [branch, setBranch]       = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts]   = useState([])
  const [selectedCat, setSelectedCat] = useState('all')
  const [cart, setCart]           = useState({})
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [lang, setLang]           = useState('ar')
  const [copied, setCopied]       = useState(false)

  // Checkout form
  const [name, setName]           = useState('')
  const [phone, setPhone]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderResult, setOrderResult] = useState(null)
  const [submitError, setSubmitError] = useState('')

  // Coupon
  const [couponCode, setCouponCode]     = useState('')
  const [couponApplied, setCouponApplied] = useState(null)   // {discount_amount, message, ...}
  const [couponError, setCouponError]   = useState('')
  const [couponChecking, setCouponChecking] = useState(false)

  // GPS
  const [gps, setGps] = useState({ status: 'idle', lat: null, lng: null, distance: null })

  useEffect(() => { loadMenu() }, [branchId])

  async function loadMenu() {
    try {
      setLoading(true)
      setError(null)
      const [{ data: b, error: be }, { data: cats }, { data: prods }] = await Promise.all([
        supabase.from('pos_branches').select('*').eq('id', branchId).eq('is_active', true).single(),
        // Categories: visible at this branch + shown on website (show_on_website = true)
        supabase.from('pos_categories')
          .select('*')
          .eq('is_active', true)
          .eq('show_on_website', true)
          .or(`visible_branch_ids.cs.{${branchId}},branch_id.eq.${branchId}`)
          .order('sort_order').order('name'),
        // Products: active + visible_on_customer_menu = true.
        // Three independent visibility channels:
        //   visible_on_menu          = POS staff terminal grid
        //   visible_on_customer_menu = this page (customer ordering)
        //   visible_on_website       = Online store (retail: tools, bags)
        // Category-level show_on_website controls which category tabs appear.
        supabase.from('pos_products')
          .select('*')
          .eq('is_active', true)
          .eq('visible_on_customer_menu', true)
          .or(`visible_branch_ids.cs.{${branchId}},branch_id.eq.${branchId}`)
          .order('menu_sort')
          .order('name'),
      ])
      if (be) throw new Error('Branch not found')
      setBranch(b)
      setCategories(cats || [])
      setProducts(prods || [])
    } catch (err) {
      setError(err.message || 'Failed to load menu')
    } finally {
      setLoading(false)
    }
  }

  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000
    const toRad = d => (d * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(a))
  }

  useEffect(() => {
    if (!showCheckout || !branch) return
    if (gps.status === 'ready' || gps.status === 'checking') return
    if (!navigator.geolocation) { setGps(g => ({ ...g, status: 'unavailable' })); return }
    if (branch.lat == null || branch.lng == null) {
      setGps({ status: 'unavailable', lat: null, lng: null, distance: null }); return
    }
    setGps(g => ({ ...g, status: 'checking' }))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude
        const distance = haversineM(lat, lng, Number(branch.lat), Number(branch.lng))
        setGps({ status: distance <= (branch.geofence_radius_m || 20) ? 'ready' : 'outside', lat, lng, distance })
      },
      (err) => setGps({ status: err.code === 1 ? 'denied' : 'unavailable', lat: null, lng: null, distance: null }),
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true },
    )
  }, [showCheckout, branch])

  const addToCart    = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }))
  const removeFromCart = (id) => setCart(c => {
    const n = { ...c }
    if (n[id] > 1) n[id]--; else delete n[id]
    return n
  })
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0)
  const cartTotal = Object.entries(cart).reduce((s, [id, q]) =>
    s + (products.find(p => p.id === id)?.price || 0) * q, 0)
  const finalTotal = couponApplied
    ? Math.max(0, cartTotal - couponApplied.discount_amount)
    : cartTotal

  // Stable color map: category_id → color pair
  const catColorMap = useMemo(() => {
    const map = {}
    categories.forEach((c, i) => { map[c.id] = CARD_COLORS[i % CARD_COLORS.length] })
    return map
  }, [categories])

  // Set of visible category IDs (categories with show_on_website = true)
  const visibleCatIds = useMemo(() => new Set(categories.map(c => c.id)), [categories])

  // Grouped layout for "All" view.
  // Only include products whose category is in the visible list — no "Other" bucket.
  const groupedView = useMemo(() => {
    if (selectedCat !== 'all' || categories.length === 0) return null
    const groups = []
    categories.forEach(cat => {
      const prods = products.filter(p => p.category_id === cat.id)
      if (prods.length > 0) groups.push({ cat, products: prods })
    })
    return groups.length > 0 ? groups : null
  }, [selectedCat, products, categories])

  const featured = products.filter(p => p.featured && visibleCatIds.has(p.category_id))
  const filtered  = selectedCat === 'all'
    ? products.filter(p => visibleCatIds.has(p.category_id))
    : products.filter(p => p.category_id === selectedCat)

  function name_(p) { return lang === 'ar' && p.name_ar ? p.name_ar : p.name }
  function desc_(p) { return lang === 'ar' && p.menu_description_ar ? p.menu_description_ar : p.menu_description }
  const t = (en, ar) => lang === 'ar' ? ar : en
  const currency = lang === 'ar' ? 'دينار' : 'LYD'

  async function handlePlaceOrder() {
    if (!name.trim())  { setSubmitError(t('Please enter your name', 'الرجاء إدخال اسمك')); return }
    if (!phone.trim()) { setSubmitError(t('Please enter your phone', 'الرجاء إدخال رقم هاتفك')); return }
    if (gps.status !== 'ready') { setSubmitError(t('Location check failed.', 'تحقق الموقع فشل.')); return }
    setSubmitError('')
    setSubmitting(true)
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }))
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_guest_order', {
        p_branch_id: branchId, p_customer_name: name, p_customer_phone: phone,
        p_payment_method: 'pickup', p_items: items,
        p_table_number: tableNumber || null, p_lat: gps.lat, p_lng: gps.lng,
      })
      if (rpcErr) throw rpcErr
      if (data?.error === 'on_site_required') {
        setSubmitError(data.reason === 'outside_geofence'
          ? t(`You appear to be ${Math.round(data.distance_m ?? 0)} m from the café.`,
              `يبدو أنك على بُعد ${Math.round(data.distance_m ?? 0)} م من الكافيه.`)
          : t('On-site verification failed.', 'فشل التحقق من الموقع.'))
        setSubmitting(false); return
      }
      if (data?.error) throw new Error(data.error)
      setOrderResult(data)
      setCart({})
      const msg = `🛎 NEW ORDER ${data.order_number}${tableNumber ? ` · Table ${tableNumber}` : ''}\n${name} · ${finalTotal.toFixed(2)} ${currency}${couponApplied ? ` (${couponApplied.message})` : ''}\nCode: ${data.pickup_code} ← confirm at POS`
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace('/rest/v1', '') || ''
      fetch(`${supabaseUrl}/functions/v1/send-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ branch_id: branchId, message: msg }),
      }).catch(() => {})
    } catch (err) {
      setSubmitError(err.message || t('Order failed. Please try again.', 'فشل الطلب. حاول مرة أخرى.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return
    setCouponError('')
    setCouponChecking(true)
    try {
      const { data, error } = await supabase.rpc('apply_coupon', {
        p_code: couponCode.trim(),
        p_branch_id: branchId,
        p_order_total: cartTotal,
      })
      if (error) throw error
      if (data?.valid) {
        setCouponApplied(data)
        setCouponError('')
      } else {
        setCouponApplied(null)
        setCouponError(data?.message || 'Invalid code')
      }
    } catch {
      setCouponError('Could not check code. Try again.')
    } finally {
      setCouponChecking(false)
    }
  }

  function copyCode(code) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function resetOrder() {
    setShowCheckout(false); setOrderResult(null); setName(''); setPhone('')
    setGps({ status: 'idle', lat: null, lng: null, distance: null })
    setCopied(false); setCouponCode(''); setCouponApplied(null); setCouponError('')
  }

  if (loading) return (
    <div className="menu-loading">
      <div className="loading-spinner" />
      <p>{t('Loading menu…', 'جارٍ تحميل المنيو…')}</p>
    </div>
  )
  if (error)   return <div className="menu-error">{error}</div>
  if (!branch) return <div className="menu-error">Branch not found</div>

  return (
    <div className="menu-root">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="menu-header">
        <div className="menu-header-inner">
          <div className="menu-header-left">
            <a
              href="https://noch.cloud/"
              className="menu-back"
              aria-label={t('Back to noch.cloud', 'الرجوع إلى noch.cloud')}
            >
              {lang === 'ar' ? '→' : '←'}
            </a>
            <img
              src={nochLogo}
              alt="Noch"
              className="menu-logo"
            />
            <div>
              <h1 className="menu-branch-name">{branch.name}</h1>
              {tableNumber && <span className="table-pill">{t('Table', 'طاولة')} {tableNumber}</span>}
            </div>
          </div>
          <button className="lang-toggle" onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}>
            {lang === 'en' ? 'ع' : 'EN'}
          </button>
        </div>
      </header>

      {/* ── Featured strip ─────────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="featured-section">
          <h2 className="section-title">{t('⭐ Featured', '⭐ المميز')}</h2>
          <div className="featured-scroll">
            {featured.map(p => (
              <ProductCard key={p.id} p={p} qty={cart[p.id] || 0}
                onAdd={() => addToCart(p.id)} onRemove={() => removeFromCart(p.id)}
                name_={name_} desc_={desc_} featured currency={currency}
                catColor={catColorMap[p.category_id] || CARD_COLORS[0]} />
            ))}
          </div>
        </section>
      )}

      {/* ── Category pills ─────────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="cat-strip" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <button className={`cat-pill${selectedCat === 'all' ? ' active' : ''}`} onClick={() => setSelectedCat('all')}>
            🍽️&nbsp;{t('All', 'الكل')}
          </button>
          {categories.map(c => {
            const label = lang === 'ar' && c.name_ar ? c.name_ar : c.name
            return (
              <button key={c.id} className={`cat-pill${selectedCat === c.id ? ' active' : ''}`} onClick={() => setSelectedCat(c.id)}>
                <CatIcon name={label} imageUrl={c.image_url} />&nbsp;{label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Products ───────────────────────────────────────────────────────── */}
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {groupedView ? (
          // Grouped view: one section per category
          groupedView.map(({ cat, products: grpProds }) => {
            const catLabel = cat
              ? (lang === 'ar' && cat.name_ar ? cat.name_ar : cat.name)
              : t('Other', 'أخرى')
            return (
              <section key={cat?.id || 'uncategorized'} className="cat-group">
                <h2 className="cat-group-heading">
                  {cat ? <CatIcon name={catLabel} imageUrl={cat.image_url} /> : '🌿'}&nbsp;{catLabel}
                </h2>
                <div className="products-grid">
                  {grpProds.map(p => (
                    <ProductCard key={p.id} p={p} qty={cart[p.id] || 0}
                      onAdd={() => addToCart(p.id)} onRemove={() => removeFromCart(p.id)}
                      name_={name_} desc_={desc_} currency={currency}
                      catColor={catColorMap[p.category_id] || CARD_COLORS[0]} />
                  ))}
                </div>
              </section>
            )
          })
        ) : (
          // Filtered single-category view
          <div className="products-grid">
            {filtered.length === 0
              ? <p className="no-products">{t('Nothing here yet — check back soon.', 'لا يوجد شيء هنا بعد.')}</p>
              : filtered.map(p => (
                  <ProductCard key={p.id} p={p} qty={cart[p.id] || 0}
                    onAdd={() => addToCart(p.id)} onRemove={() => removeFromCart(p.id)}
                    name_={name_} desc_={desc_} currency={currency}
                    catColor={catColorMap[p.category_id] || CARD_COLORS[0]} />
                ))
            }
          </div>
        )}
      </div>

      {/* ── Sticky cart bar ────────────────────────────────────────────────── */}
      {cartCount > 0 && !showCheckout && (
        <div className="cart-bar" onClick={() => setShowCheckout(true)}>
          <span className="cart-badge">{cartCount}</span>
          <span className="cart-bar-label">{t('View Order', 'عرض الطلب')}</span>
          <span className="cart-bar-total">{cartTotal.toFixed(2)} {currency}</span>
        </div>
      )}

      {/* ── Checkout sheet ─────────────────────────────────────────────────── */}
      {showCheckout && (
        <div className="sheet-overlay" onClick={() => !submitting && !orderResult && setShowCheckout(false)}>
          <div className="checkout-sheet" onClick={e => e.stopPropagation()}>

            {/* Success screen */}
            {orderResult && (
              <div className="order-success">
                <div className="success-check">✓</div>
                <h2 className="success-title">{t('Order sent!', 'تم إرسال طلبك!')}</h2>
                <p className="success-sub">{t('Show this code to the cashier', 'أرِ هذا الرمز للكاشير')}</p>
                <div className="pickup-code-wrap">
                  <div className="pickup-code">{orderResult.pickup_code}</div>
                  <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={() => copyCode(orderResult.pickup_code)}>
                    {copied ? t('✓ Copied', '✓ تم النسخ') : t('⧉ Copy code', '⧉ نسخ')}
                  </button>
                </div>
                <p className="order-number">{orderResult.order_number}</p>
                <p className="order-total">{Number(orderResult.total).toFixed(2)} {currency}</p>
                {tableNumber && <p className="order-table">{t('Table', 'طاولة')} {tableNumber}</p>}
                <p className="staff-note">
                  {t('The cashier will confirm your order shortly.', 'سيقوم الكاشير بتأكيد طلبك في أقرب وقت.')}
                </p>
                <button className="btn-done" onClick={resetOrder}>{t('Done', 'تم')}</button>
              </div>
            )}

            {/* Checkout form */}
            {!orderResult && (
              <>
                <div className="sheet-handle" />
                <div className="sheet-header-row">
                  <h2 className="sheet-title">{t('Your Order', 'طلبك')}</h2>
                  <button
                    className="sheet-cancel-btn"
                    onClick={() => !submitting && setShowCheckout(false)}
                    disabled={submitting}
                  >
                    {t('✕ Cancel', '✕ إلغاء')}
                  </button>
                </div>

                <div className="sheet-items">
                  {Object.entries(cart).map(([id, qty]) => {
                    const p = products.find(x => x.id === id)
                    if (!p || !qty) return null
                    return (
                      <div key={id} className="sheet-item">
                        <span className="sheet-item-qty">{qty}×</span>
                        <span className="sheet-item-name">{name_(p)}</span>
                        <span className="sheet-item-price">{(p.price * qty).toFixed(2)} {currency}</span>
                      </div>
                    )
                  })}
                  <div className={`sheet-total${couponApplied ? ' crossed' : ''}`}>
                    <span>{t('Subtotal', 'المجموع الفرعي')}</span>
                    <span>{cartTotal.toFixed(2)} {currency}</span>
                  </div>
                  {couponApplied && (
                    <div className="sheet-discount-row">
                      <span>🎉 {couponApplied.message}</span>
                      <span>−{couponApplied.discount_amount.toFixed(2)} {currency}</span>
                    </div>
                  )}
                  {couponApplied && (
                    <div className="sheet-final-total">
                      <span>{t('Total', 'الإجمالي')}</span>
                      <span>{finalTotal.toFixed(2)} {currency}</span>
                    </div>
                  )}
                </div>

                {/* Coupon / discount code */}
                <div className="coupon-section">
                  <div className="coupon-row">
                    <input
                      className="sheet-input coupon-input"
                      value={couponCode}
                      onChange={e => {
                        setCouponCode(e.target.value.toUpperCase())
                        setCouponError('')
                        if (couponApplied) setCouponApplied(null)
                      }}
                      placeholder={t('Coupon / discount code', 'كود الخصم')}
                      disabled={submitting || couponChecking || !!couponApplied}
                      onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                    />
                    <button
                      className={`btn-coupon${couponApplied ? ' applied' : ''}`}
                      onClick={couponApplied
                        ? () => { setCouponApplied(null); setCouponCode(''); setCouponError('') }
                        : applyCoupon}
                      disabled={!couponCode.trim() && !couponApplied || submitting || couponChecking}
                    >
                      {couponChecking ? '…' : couponApplied ? t('✕ Remove', '✕ إزالة') : t('Apply', 'تطبيق')}
                    </button>
                  </div>
                  {couponApplied && (
                    <p className="coupon-success">
                      🎉 {couponApplied.message} — {t('saving', 'وفّرت')} <span>{couponApplied.discount_amount.toFixed(2)} {currency}</span>
                    </p>
                  )}
                  {couponError && <p className="coupon-error">{couponError}</p>}
                </div>

                <div className="sheet-form">
                  <input className="sheet-input" value={name} onChange={e => setName(e.target.value)}
                    placeholder={t('Your name', 'اسمك')} disabled={submitting} />
                  <input className="sheet-input" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder={t('Phone (e.g. 0912345678)', 'رقم الهاتف')}
                    type="tel" disabled={submitting} />

                  {gps.status === 'checking' && (
                    <div className="gps-row">📍 {t('Checking your location…', 'جارٍ التحقق من موقعك…')}</div>
                  )}
                  {gps.status === 'outside' && (
                    <div className="gps-row warn">
                      {t(`You need to be at ${branch.name} to place an order.`,
                         `يجب أن تكون في ${branch.name} لتقديم الطلب.`)}
                      {gps.distance != null && <> ({Math.round(gps.distance)} m {t('away', 'بُعداً')})</>}
                    </div>
                  )}
                  {gps.status === 'denied' && (
                    <div className="gps-row warn">
                      {t('Please enable location access, then reopen checkout.',
                         'يرجى تفعيل الموقع ثم إعادة فتح صفحة الدفع.')}
                    </div>
                  )}
                  {gps.status === 'unavailable' && (
                    <div className="gps-row warn">
                      {t('Location check unavailable. Please order with a staff member.',
                         'تحقق الموقع غير متاح. تواصل مع الكاشير مباشرة.')}
                    </div>
                  )}

                  {submitError && <p className="submit-error">{submitError}</p>}

                  {gps.status === 'ready' && (
                    <button type="button" className="btn-order" onClick={handlePlaceOrder} disabled={submitting}>
                      {submitting
                        ? t('Submitting…', 'جارٍ الإرسال…')
                        : t(`Send to Cashier · ${finalTotal.toFixed(2)} ${currency}`,
                            `إرسال للكاشير · ${finalTotal.toFixed(2)} ${currency}`)}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductCard({ p, qty, onAdd, onRemove, name_, desc_, featured: isFeatured, catColor, currency }) {
  const col = catColor || CARD_COLORS[0]
  const soldOut = p.is_available === false
  return (
    <div className={`product-card${isFeatured ? ' featured' : ''}${soldOut ? ' sold-out' : ''}`}>
      {p.image_url ? (
        <div className="product-img-wrap">
          <img src={p.image_url} alt={name_(p)} className="product-img" loading="lazy" />
          {soldOut && <span className="sold-out-badge">Sold out</span>}
        </div>
      ) : (
        <div className="product-img-wrap product-placeholder" style={{ background: col.bg }}>
          <span className="placeholder-letter" style={{ color: col.text }}>
            {name_(p).charAt(0).toUpperCase()}
          </span>
          {soldOut && <span className="sold-out-badge">Sold out</span>}
        </div>
      )}
      <div className="product-body">
        <p className="product-name">{name_(p)}</p>
        {desc_(p) && <p className="product-desc">{desc_(p)}</p>}
        <div className="product-footer">
          <span className="product-price">{parseFloat(p.price).toFixed(2)} {currency}</span>
          {soldOut ? null : qty === 0 ? (
            <button className="btn-add" onClick={onAdd}>+</button>
          ) : (
            <div className="qty-ctrl">
              <button className="qty-btn" onClick={onRemove}>−</button>
              <span>{qty}</span>
              <button className="qty-btn" onClick={onAdd}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
