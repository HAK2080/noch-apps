// POSTerminal.jsx — Main POS terminal page
// Route: /pos/:branchId

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, ScanLine, Settings, ArrowLeft, Wifi, WifiOff, RefreshCw, ClipboardList, ShoppingBag, ChevronDown, ChevronUp, ListOrdered, Users, UserPlus, X, QrCode } from 'lucide-react'
import { supabase, recordPosCustomerVisit, lookupCustomerByPassportToken } from '../../../lib/supabase'
// Scanner components are heavy (@zxing / html5-qrcode) — keep them out of the
// initial bundle and only fetch on first scan press. Saves ~800 KB on cold load.
const QRScanner      = lazy(() => import('../components/QRScanner'))
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'))
import {
  getPOSBranch, getPOSProducts, getPOSCategories,
  getPOSProductByBarcode, createPOSOrder, getOpenShift,
  setProductSoldOut,
} from '../lib/pos-supabase'
import { getPOSSettings } from '../lib/pos-settings'
import POSPinLogin from './POSPinLogin'
import ShiftAttendees from '../components/ShiftAttendees'
import ProductModifierModal from '../components/ProductModifierModal'
import { getModifierGroupsForProduct } from '../lib/pos-supabase'
import {
  cacheProducts, getCachedProducts,
  cacheCategories, getCachedCategories,
  queueOfflineOrder, isOnline
} from '../lib/pos-offline'
import { startSyncListener } from '../lib/pos-sync'
import ProductGrid from '../components/ProductGrid'
import CartPanel from '../components/CartPanel'
import PaymentModal from '../components/PaymentModal'
import ReceiptModal from '../components/ReceiptModal'
import { useAuth } from '../../../contexts/AuthContext'
import { getServedBy } from '../lib/pos-session'
import { isKioskMode } from '../lib/pos-kiosk'
import { round, sum, lineTotal } from '../lib/money'
import { isPrinterConnected, printReceipt } from '../lib/escpos'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

let itemIdCounter = 0
function newItemId() { return ++itemIdCounter }

function OnlineOrderRow({ order, branchId, onConfirmed }) {
  const [confirming, setConfirming] = useState(false)

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const { data, error } = await supabase.rpc('confirm_pickup_order', {
        p_pickup_code: order.pickup_code,
        p_branch_id: branchId,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(`Order ${order.order_number} confirmed`)
      onConfirmed()
    } catch (err) {
      toast.error(err.message || 'Confirm failed')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm border ${
      order.awaiting_staff_confirm
        ? 'bg-yellow-500/10 border-yellow-500/30'
        : 'bg-noch-dark border-transparent'
    }`}>
      <div className="flex flex-col gap-0.5">
        <span className="text-noch-green font-mono text-xs">{order.order_number}</span>
        <span className="text-white">{order.customer_name || 'Guest'}</span>
        {order.table_number && <span className="text-yellow-400 text-xs">📍 Table {order.table_number}</span>}
        {order.awaiting_staff_confirm && order.pickup_code && (
          <span className="text-yellow-300 text-xs font-mono tracking-widest">CODE: {order.pickup_code}</span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-white font-semibold">{Number(order.total).toFixed(2)} LYD</span>
        <span className="text-noch-muted text-xs">
          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {order.awaiting_staff_confirm && (
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-full transition-colors disabled:opacity-50"
          >
            {confirming ? '…' : 'Confirm'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function POSTerminal() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [branch, setBranch] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [shift, setShift] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(isOnline())
  const [offlineQueue, setOfflineQueue] = useState(0)
  // PIN gate: seed from sessionStorage so a page refresh within the same
  // tab keeps the same operator. Staff can switch via the header button.
  const [pinVerified, setPinVerified] = useState(() => !!getServedBy())

  // Cart state
  const [cart, setCart] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  // Loyalty customer attached to the current order (Passport Phase 1).
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  // Memory drawer: expanded read-only view of attached customer's
  // preferences and consents (Phase 5).
  const [showMemory, setShowMemory] = useState(false)

  // Tile-language preference: 'both' | 'en' | 'ar'. Persisted per device.
  const [tileLang, setTileLang] = useState(() => localStorage.getItem('pos-tile-lang') || 'both')
  const cycleTileLang = () => {
    const next = tileLang === 'both' ? 'en' : tileLang === 'en' ? 'ar' : 'both'
    setTileLang(next)
    localStorage.setItem('pos-tile-lang', next)
  }

  // Online orders
  const [onlineOrders, setOnlineOrders] = useState([])
  const [showOnlineOrders, setShowOnlineOrders] = useState(false)
  const onlineOrdersTimer = useRef(null)

  // Modals
  const [showPayment, setShowPayment] = useState(null) // charge data
  const [showReceipt, setShowReceipt] = useState(null) // { order, items }
  const [showScanner, setShowScanner] = useState(false)
  const [submitting, setSubmitting] = useState(false)  // disables Charge while RPC is in flight
  const [showAttendees, setShowAttendees] = useState(false)
  const [modifierProduct, setModifierProduct] = useState(null)

  // Load branch, products, categories
  useEffect(() => {
    const load = async () => {
      try {
        const [b, s, st] = await Promise.all([
          getPOSBranch(branchId),
          getOpenShift(branchId),
          getPOSSettings(branchId),
        ])
        setBranch(b)
        setShift(s)
        setSettings(st)

        // Stale-while-revalidate: show cached products immediately (fast),
        // then refresh from DB in the background (always fresh).
        const [cachedProds, cachedCats] = await Promise.all([
          getCachedProducts(branchId),
          getCachedCategories(branchId),
        ])
        if (cachedProds.length > 0) setProducts(cachedProds)
        if (cachedCats.length > 0) setCategories(cachedCats)

        if (isOnline()) {
          const [prods, cats] = await Promise.all([
            getPOSProducts(branchId),
            getPOSCategories(branchId),
          ])
          setProducts(prods)
          setCategories(cats)
          cacheProducts(branchId, prods).catch(() => {})
          cacheCategories(branchId, cats).catch(() => {})
        }
      } catch (err) {
        toast.error(err.message || 'Failed to load terminal')
      } finally {
        setLoading(false)
      }
    }
    load()

    // Online/offline listeners
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Start sync listener
    const stopSync = startSyncListener()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      stopSync()
    }
  }, [branchId])

  // Poll for online orders every 30 seconds
  useEffect(() => {
    async function fetchOnlineOrders() {
      if (!isOnline()) return
      try {
        const { data, error: err } = await supabase
          .from('pos_orders')
          .select('id,order_number,customer_name,total,table_number,created_at,awaiting_staff_confirm,pickup_code')
          .eq('branch_id', branchId)
          .eq('source', 'online')
          .in('status', ['pending', 'pending_confirm'])
          .order('created_at', { ascending: false })
          .limit(10)

        if (!err) {
          setOnlineOrders(data || [])
        }
      } catch {
        // silently ignore poll errors
      }
    }

    fetchOnlineOrders()
    onlineOrdersTimer.current = setInterval(fetchOnlineOrders, 30000)

    return () => {
      if (onlineOrdersTimer.current) clearInterval(onlineOrdersTimer.current)
    }
  }, [branchId])

  // addCartLine: append a fully-formed cart line (used after the
  // modifier modal returns, and from the bare addToCart path below).
  const addCartLine = useCallback((product, overrides = {}) => {
    setCart(prev => {
      // Lines with modifiers always create a NEW row (different config).
      // Bare lines collapse onto an existing row of the same product.
      const hasMods = (overrides.modifiers && overrides.modifiers.length) || false
      if (!hasMods) {
        const existing = prev.find(i => i.product_id === product.id && (!i.modifiers || i.modifiers.length === 0))
        if (existing) {
          return prev.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i)
        }
      }
      return [...prev, {
        id: newItemId(),
        product_id: product.id,
        name: product.name,
        name_ar: product.name_ar,
        price: overrides.unit_price != null ? Number(overrides.unit_price) : parseFloat(product.price),
        quantity: 1,
        track_inventory: product.track_inventory,
        notes: '',
        modifiers: overrides.modifiers || [],
      }]
    })
  }, [])

  // addToCart: entry point used by ProductGrid and barcode scan.
  // Checks stock guards, then (for non-barcode taps) consults modifier
  // groups; if any exist, opens the modifier modal instead of adding.
  const addToCart = useCallback(async (product, opts = {}) => {
    if (product.is_sold_out) {
      toast.error(`${product.name} is sold out`)
      return
    }
    if (settings?.block_out_of_stock && product.track_inventory) {
      const onHand = parseFloat(product.stock_qty)
      if (Number.isFinite(onHand) && onHand <= 0) {
        toast.error(`${product.name} is out of stock`)
        return
      }
    }
    if (opts.skipModifiers) {
      addCartLine(product)
      return
    }
    try {
      const groups = await getModifierGroupsForProduct(product.id)
      if (groups && groups.length > 0) {
        setModifierProduct({ product, groups })
        return
      }
    } catch { /* if the lookup fails, fall through to bare add */ }
    addCartLine(product)
  }, [settings, addCartLine])

  // Long-press a tile to flip is_sold_out for the day. Optimistic UI.
  const handleSoldOutToggle = useCallback(async (product) => {
    const next = !product.is_sold_out
    setProducts(ps => ps.map(p => p.id === product.id ? { ...p, is_sold_out: next } : p))
    try {
      await setProductSoldOut(product.id, next)
      toast.success(next ? `${product.name} marked sold out` : `${product.name} back in stock`)
    } catch (err) {
      // Revert on failure
      setProducts(ps => ps.map(p => p.id === product.id ? { ...p, is_sold_out: !next } : p))
      toast.error(err.message || 'Could not update')
    }
  }, [])

  const updateQty = (itemId, qty) => {
    setCart(prev => prev.map(i => i.id === itemId ? { ...i, quantity: qty } : i))
  }

  const removeItem = (itemId) => {
    setCart(prev => prev.filter(i => i.id !== itemId))
  }

  const clearCart = () => setCart([])

  const handleDiscount = ({ type, value, amount }) => {
    // stored in charge data via CartPanel
  }

  // Handle barcode scan. Barcode flow skips the modifier picker — the
  // assumption is that scanned items are pre-packaged retail SKUs, not
  // configurable drinks. Drinks added by tile tap still get the modal.
  const handleScan = async (result) => {
    setShowScanner(false)
    try {
      const product = await getPOSProductByBarcode(branchId, result)
      await addToCart(product, { skipModifiers: true })
      toast.success(`Added: ${product.name}`)
    } catch {
      toast.error(`Product not found for barcode: ${result}`)
    }
  }

  // Charge (open payment modal)
  const handleCharge = (chargeData) => {
    if (cart.length === 0) return
    setShowPayment(chargeData)
  }

  // Complete payment
  const handlePaymentComplete = async (paymentData) => {
    if (submitting) return
    setSubmitting(true)

    const subtotal = sum(cart.map(i => lineTotal(i.price, i.quantity)))
    const discountAmount = round(showPayment.discountAmount || 0)
    const total = round(Math.max(0, subtotal - discountAmount))

    const servedByProfile = getServedBy()

    // Idempotency key: stable across retries within this charge attempt.
    // Generated client-side so a network retry of the same submit hits the
    // same server-side row instead of double-charging.
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

    const clientCreatedAt = new Date().toISOString()

    const orderData = {
      branch_id: branchId,
      shift_id: shift?.id || null,
      served_by: servedByProfile?.id || null,
      idempotency_key: idempotencyKey,
      client_created_at: clientCreatedAt,
      subtotal,
      discount_amount: discountAmount,
      discount_pct: showPayment.discountType === 'pct' ? (showPayment.discountValue || 0) : 0,
      total,
      ...paymentData,
      synced: isOnline(),
    }

    const items = cart.map(i => ({
      product_id: i.product_id,
      product_name: i.name,
      product_name_ar: i.name_ar,
      unit_price: round(i.price),
      quantity: i.quantity,
      total: lineTotal(i.price, i.quantity),
      track_inventory: i.track_inventory,
      notes: i.notes,
      modifiers: Array.isArray(i.modifiers) ? i.modifiers : [],
    }))

    try {
      let order
      if (isOnline()) {
        order = await createPOSOrder(orderData, items)
      } else {
        // Offline: queue with the pre-generated idempotency_key so sync
        // dedupes correctly even if the queue runs twice.
        const localId = await queueOfflineOrder({ ...orderData, items })
        setOfflineQueue(q => q + 1)
        // Local receipt uses the OFFLINE-* number; this same number is
        // preserved server-side at sync time (see pos-sync.js) so the
        // customer's printed slip remains valid.
        order = {
          ...orderData,
          id: `offline-${localId}`,
          order_number: `OFFLINE-${localId}`,
          created_at: clientCreatedAt,
        }
        toast('Order saved offline. Will sync when online.', { icon: '📴' })
      }

      // Passport Phase 1 — bump last_visit_at, total_visits, and
      // backfill favorite_drink only if currently null. Non-fatal:
      // never block sale completion on the memory update.
      const visitCustomerId = paymentData.loyalty_customer_id || loyaltyCustomer?.id || null
      if (visitCustomerId && !String(order.id || '').startsWith('offline-')) {
        try {
          const firstItemName = items[0]?.product_name || null
          await recordPosCustomerVisit(visitCustomerId, firstItemName)
        } catch {
          /* swallow — POS UX shouldn't suffer if memory write fails */
        }
      }

      setShowPayment(null)
      setShowReceipt({ order, items, loyaltyCustomer })
      setCart([])
      setLoyaltyCustomer(null)

      // Auto-print: fire-and-forget if enabled + printer is connected.
      // Failure toasts but never blocks the receipt modal from appearing.
      if (localStorage.getItem('noch_auto_print') === 'true' && isPrinterConnected()) {
        printReceipt(order, branch, items).catch(err =>
          toast.error(`Auto-print failed: ${err.message}`)
        )
      }
    } catch (err) {
      toast.error(err.message || 'Failed to complete sale')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-24">
        <p className="text-noch-muted">Loading terminal...</p>
      </div>
    </Layout>
  )

  // PIN gate. The branch's pos_settings.require_pin defaults to true; the
  // terminal will not render until a barista is verified. POSPinLogin
  // routes through the verify_pos_pin RPC (rate-limited, per-user salt).
  // Owners can skip — POSPinLogin gates the Skip button on isOwner from
  // AuthContext, so non-owners never see it.
  if (settings?.require_pin !== false && !pinVerified) {
    return (
      <Layout>
        <POSPinLogin
          branchId={branchId}
          onSuccess={() => setPinVerified(true)}
          onSkip={() => setPinVerified(true)}
        />
      </Layout>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-noch-dark overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-noch-card border-b border-noch-border shrink-0">
        <button onClick={() => navigate(isKioskMode() ? '/kiosk' : '/pos')} className="text-noch-muted hover:text-white p-1">
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-sm truncate">{branch?.name}</h1>
          {shift ? (
            <p className="text-noch-green text-xs">Shift open</p>
          ) : (
            <p className="text-yellow-400 text-xs">No shift — go to Settings to open one</p>
          )}
        </div>

        {/* Serving staff chip — tap to switch */}
        {getServedBy() && (
          <button
            onClick={() => { setPinVerified(false) }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-noch-border bg-noch-dark text-xs text-noch-muted hover:border-noch-green/50 hover:text-white transition-colors shrink-0"
            title="Switch staff"
          >
            <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">
              {getServedBy()?.full_name?.charAt(0)?.toUpperCase() || '?'}
            </span>
            <span className="max-w-[80px] truncate">{getServedBy()?.full_name}</span>
            <Users size={10} />
          </button>
        )}

        {/* Search */}
        <div className="relative hidden sm:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input pl-8 py-1.5 text-sm w-40"
          />
        </div>

        {/* Online Orders badge */}
        <button
          onClick={() => setShowOnlineOrders(v => !v)}
          className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded text-sm font-medium transition-colors ${
            onlineOrders.length > 0
              ? 'bg-noch-green/20 text-noch-green hover:bg-noch-green/30'
              : 'text-noch-muted hover:text-white'
          }`}
          title="Online Orders"
        >
          <ShoppingBag size={16} />
          {onlineOrders.length > 0 && (
            <span className="bg-noch-green text-black text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
              {onlineOrders.length}
            </span>
          )}
          {showOnlineOrders ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* Actions */}
        <button
          onClick={cycleTileLang}
          className="px-2 py-1.5 text-noch-muted hover:text-white text-[11px] font-bold uppercase tracking-wider border border-noch-border rounded"
          title="Toggle product label language"
        >
          {tileLang === 'both' ? 'EN+AR' : tileLang === 'en' ? 'EN' : 'AR'}
        </button>
        <button onClick={() => setShowScanner(true)} className="p-2 text-noch-muted hover:text-white">
          <ScanLine size={18} />
        </button>
        {settings?.per_barista_shift && shift && (
          <button onClick={() => setShowAttendees(true)} className="p-2 text-noch-muted hover:text-white" title="Shift attendees">
            <Users size={18} />
          </button>
        )}
        <button onClick={() => navigate(`/pos/${branchId}/orders`)} className="p-2 text-noch-muted hover:text-white" title="Orders">
          <ListOrdered size={18} />
        </button>
        <button onClick={() => navigate(`/pos/${branchId}/stock-check`)} className="p-2 text-noch-muted hover:text-white" title="Stock Check">
          <ClipboardList size={18} />
        </button>
        <button onClick={() => navigate(`/pos/${branchId}/end-of-day`)} className="p-2 text-noch-muted hover:text-white" title="End of Day">
          <ShoppingBag size={18} />
        </button>
        <button onClick={() => navigate(`/pos/${branchId}/settings`)} className="p-2 text-noch-muted hover:text-white" title="Settings">
          <Settings size={18} />
        </button>

        {/* Online indicator */}
        <div className={`flex items-center gap-1 text-xs ${online ? 'text-noch-green' : 'text-red-400'}`}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {offlineQueue > 0 && <span className="bg-yellow-500 text-black rounded-full px-1 text-[10px]">{offlineQueue}</span>}
        </div>
      </header>

      {/* Online Orders Panel */}
      {showOnlineOrders && (
        <div className="bg-noch-card border-b border-noch-border shrink-0 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <ShoppingBag size={14} className="text-noch-green" />
              Online Orders
              {onlineOrders.length === 0 && (
                <span className="text-noch-muted font-normal">(none pending)</span>
              )}
            </h2>
          </div>
          {onlineOrders.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {onlineOrders.map(order => (
                <OnlineOrderRow
                  key={order.id}
                  order={order}
                  branchId={branchId}
                  onConfirmed={() => setOnlineOrders(prev => prev.filter(o => o.id !== order.id))}
                />
              ))}
            </div>
          ) : (
            <p className="text-noch-muted text-sm">No pending online orders.</p>
          )}
        </div>
      )}

      {/* Mobile search */}
      <div className="sm:hidden px-3 py-2 border-b border-noch-border shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input pl-8 py-2 text-sm w-full"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product grid — left 60% */}
        <div className="flex-[3] p-3 overflow-hidden flex flex-col">
          <ProductGrid
            products={products}
            categories={categories}
            onSelect={addToCart}
            onLongPress={handleSoldOutToggle}
            blockOutOfStock={!!settings?.block_out_of_stock}
            searchQuery={searchQuery}
            tileLang={tileLang}
          />
        </div>

        {/* Divider */}
        <div className="w-px bg-noch-border shrink-0" />

        {/* Cart panel — right 40% */}
        <div className="flex-[2] p-3 overflow-hidden flex flex-col min-w-[240px]">
          {/* Passport customer chip (above cart) */}
          <div className="mb-2 shrink-0">
            {loyaltyCustomer ? (
              <>
                <div className="flex items-center gap-2 bg-noch-green/10 border border-noch-green/30 rounded-xl px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-noch-green/20 text-noch-green flex items-center justify-center text-xs font-bold shrink-0">
                    {(loyaltyCustomer.full_name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{loyaltyCustomer.full_name}</p>
                    <p className="text-noch-muted text-xs">
                      {loyaltyCustomer.tier ? `${loyaltyCustomer.tier} · ` : ''}{loyaltyCustomer.current_stamps ?? 0} stamps
                    </p>
                  </div>
                  <button
                    onClick={() => setShowMemory(v => !v)}
                    className="text-noch-muted hover:text-white text-xs px-2"
                    title={showMemory ? 'Hide details' : 'Show details'}
                  >
                    {showMemory ? '▾' : '▸'}
                  </button>
                  <button
                    onClick={() => setShowCustomerSearch(true)}
                    className="text-noch-muted hover:text-white text-xs px-2"
                    title="Swap"
                  >
                    Swap
                  </button>
                  <button
                    onClick={() => { setLoyaltyCustomer(null); setShowMemory(false) }}
                    className="text-noch-muted hover:text-white p-1"
                    title="Detach"
                  >
                    <X size={14} />
                  </button>
                </div>
                {showMemory && (
                  <CustomerMemoryDrawer customerId={loyaltyCustomer.id} fallback={loyaltyCustomer} />
                )}
              </>
            ) : (
              <button
                onClick={() => setShowCustomerSearch(true)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-noch-border text-noch-muted hover:text-white hover:border-noch-green/40 text-sm transition-colors"
              >
                <UserPlus size={14} />
                Attach customer
              </button>
            )}
          </div>

          <CartPanel
            items={cart}
            onUpdateQty={updateQty}
            onRemove={removeItem}
            onDiscount={handleDiscount}
            onClear={clearCart}
            onCharge={handleCharge}
            managerOverrideEnabled={!!settings?.manager_override_enabled}
            posLang={tileLang === 'ar' ? 'ar' : 'en'}
          />
        </div>
      </div>

      {/* Modals */}
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {showPayment && (
        <PaymentModal
          total={showPayment.total}
          submitting={submitting}
          onComplete={handlePaymentComplete}
          onClose={() => !submitting && setShowPayment(null)}
          loyaltyCustomer={loyaltyCustomer}
          posLang={tileLang === 'ar' ? 'ar' : 'en'}
        />
      )}

      {showReceipt && (
        <ReceiptModal
          order={showReceipt.order}
          items={showReceipt.items}
          branch={branch}
          loyaltyCustomer={showReceipt.loyaltyCustomer}
          onNewOrder={() => setShowReceipt(null)}
          onClose={() => setShowReceipt(null)}
          posLang={tileLang === 'ar' ? 'ar' : 'en'}
        />
      )}

      {showCustomerSearch && (
        <CustomerSearchModal
          onSelect={(c) => { setLoyaltyCustomer(c); setShowCustomerSearch(false) }}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}

      {showAttendees && shift && (
        <ShiftAttendees
          shiftId={shift.id}
          branchId={branchId}
          onClose={() => setShowAttendees(false)}
        />
      )}

      {modifierProduct && (
        <ProductModifierModal
          product={modifierProduct.product}
          onAdd={({ unit_price, modifiers }) => {
            addCartLine(modifierProduct.product, { unit_price, modifiers })
            setModifierProduct(null)
          }}
          onClose={() => setModifierProduct(null)}
        />
      )}
    </div>
  )
}

function CustomerMemoryDrawer({ customerId, fallback }) {
  const [data, setData] = useState(fallback || null)
  const [memory, setMemory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [rowRes, memRes] = await Promise.all([
          supabase
            .from('loyalty_customers')
            .select(`
              id, full_name, phone, tier, current_stamps, total_visits, nochi_state,
              birthday_day, birthday_month,
              favorite_drink, favorite_drinks, favorite_other,
              milk_preference, sweetness_preference,
              instagram_handle, tiktok_handle, facebook_handle,
              whatsapp_opt_in, whatsapp_opt_in_at,
              ugc_consent, ugc_consent_at,
              consent_source
            `)
            .eq('id', customerId)
            .maybeSingle(),
          supabase.rpc('get_customer_memory', { p_customer_id: customerId }),
        ])
        if (cancelled) return
        if (!rowRes.error && rowRes.data) setData(rowRes.data)
        if (!memRes.error) {
          // RPC returns the row shape directly
          setMemory(Array.isArray(memRes.data) ? memRes.data[0] : memRes.data)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [customerId])

  const copyGreeting = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  if (!data) {
    return (
      <div className="mt-2 bg-noch-card border border-noch-border rounded-xl p-3 text-xs text-noch-muted">
        {loading ? 'Loading…' : 'No memory yet.'}
      </div>
    )
  }

  const drinks = Array.isArray(data.favorite_drinks) && data.favorite_drinks.length > 0
    ? data.favorite_drinks
    : (data.favorite_drink ? [data.favorite_drink] : [])
  const handleLine = ['instagram_handle', 'tiktok_handle', 'facebook_handle']
    .map(k => data[k] ? { k, v: data[k] } : null)
    .filter(Boolean)
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB') : null
  const consentTip = (when, source) =>
    [fmtDate(when), source].filter(Boolean).join(' · ')

  return (
    <div className="mt-2 bg-noch-card border border-noch-border rounded-xl p-3 text-xs space-y-1.5">
      {/* Phase 8 — memory summary + suggested greeting (AI-helper, never auto-sent) */}
      {memory?.summary_en && (
        <div className="bg-noch-dark/40 border border-noch-border/50 rounded-lg p-2.5 space-y-1.5">
          <p className="text-white/90 leading-snug">{memory.summary_en}</p>
          {memory.greeting_en && (
            <button
              type="button"
              onClick={() => copyGreeting(memory.greeting_en)}
              className="w-full text-left text-noch-green hover:text-noch-green/80 italic flex items-start gap-1.5 transition-colors"
              title="Copy suggested greeting"
            >
              <span className="opacity-60 not-italic shrink-0">💬</span>
              <span className="flex-1">"{memory.greeting_en}"</span>
              <span className="opacity-60 not-italic text-[10px] shrink-0">{copied ? '✓' : '⧉'}</span>
            </button>
          )}
        </div>
      )}

      {drinks.length > 0 && (
        <p className="text-noch-muted">
          <span className="text-white font-medium">☕ </span>
          {drinks.join(' · ')}
          {data.milk_preference && <span> · milk: {data.milk_preference}</span>}
          {data.sweetness_preference && <span> · sweet: {data.sweetness_preference}</span>}
        </p>
      )}

      {data.favorite_other && (
        <p className="text-noch-muted">
          <span className="text-white font-medium">🥐 </span>
          {data.favorite_other}
        </p>
      )}

      {data.birthday_day && data.birthday_month && (
        <p className="text-noch-muted">
          <span className="text-white font-medium">🎂 </span>
          {data.birthday_day}/{data.birthday_month}
        </p>
      )}

      {handleLine.length > 0 && (
        <p className="text-noch-muted flex flex-wrap gap-x-2 gap-y-0.5">
          {data.instagram_handle && <span><span className="text-white font-medium">IG:</span> @{data.instagram_handle}</span>}
          {data.tiktok_handle    && <span><span className="text-white font-medium">TT:</span> @{data.tiktok_handle}</span>}
          {data.facebook_handle  && <span><span className="text-white font-medium">FB:</span> {data.facebook_handle}</span>}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            data.whatsapp_opt_in
              ? 'bg-noch-green/15 text-noch-green border border-noch-green/30'
              : 'bg-noch-border/30 text-noch-muted border border-noch-border'
          }`}
          title={consentTip(data.whatsapp_opt_in_at, data.consent_source)}
        >
          WhatsApp: {data.whatsapp_opt_in ? 'yes' : 'no'}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            data.ugc_consent
              ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
              : 'bg-noch-border/30 text-noch-muted border border-noch-border'
          }`}
          title={consentTip(data.ugc_consent_at, data.consent_source)}
        >
          UGC consent: {data.ugc_consent ? 'yes' : 'no'}
        </span>
      </div>
    </div>
  )
}

function CustomerSearchModal({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showScan, setShowScan] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('loyalty_customers')
          .select('id, full_name, phone, tier, current_stamps, total_visits, nochi_state, passport_token')
          .or(`phone.ilike.%${q}%,full_name.ilike.%${q}%`)
          .order('last_visit_at', { ascending: false, nullsFirst: false })
          .limit(8)
        if (!cancelled && !error) setResults(data || [])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  const handleScan = async (raw) => {
    setShowScan(false)
    // Accept either a bare uuid or our prefixed form. Strip prefix and
    // anything after a slash.
    let token = String(raw || '').trim()
    const m = token.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (m) token = m[0]
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      toast.error("Couldn't read that code")
      return
    }
    try {
      const c = await lookupCustomerByPassportToken(token)
      if (!c) { toast.error('No customer matches this code'); return }
      onSelect(c)
    } catch (err) {
      toast.error(err.message || 'Lookup failed')
    }
  }

  return (
    <>
      {showScan && (
        <Suspense fallback={null}>
          <QRScanner onScan={handleScan} onClose={() => setShowScan(false)} />
        </Suspense>
      )}
      <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-20" onClick={onClose}>
        <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-noch-border">
            <h3 className="text-white font-bold">Attach customer</h3>
            <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
          </div>
          <div className="p-4">
            <button
              onClick={() => setShowScan(true)}
              className="w-full flex items-center justify-center gap-2 mb-3 py-2.5 rounded-xl border border-noch-green/40 text-noch-green hover:bg-noch-green/10 text-sm font-medium transition-colors"
            >
              <QrCode size={16} />
              Scan customer’s Pass code
            </button>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-noch-border" />
              <span className="text-noch-muted text-[11px] uppercase tracking-wider">or search</span>
              <div className="flex-1 h-px bg-noch-border" />
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Phone or name..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input w-full mb-3"
            />
            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {searching && <p className="text-noch-muted text-xs px-2 py-1">Searching…</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-noch-muted text-sm px-2 py-2">No matches.</p>
              )}
              {results.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="text-left px-3 py-2 rounded-lg hover:bg-noch-green/10 border border-transparent hover:border-noch-green/30"
                >
                  <p className="text-white text-sm font-medium">{c.full_name}</p>
                  <p className="text-noch-muted text-xs">
                    {c.phone} · {c.tier} · {c.current_stamps ?? 0} stamps · {c.total_visits ?? 0} visits
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
