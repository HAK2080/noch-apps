// POSTerminal.jsx — Main POS terminal page
// Route: /pos/:branchId

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, ScanLine, Settings, ArrowLeft, Wifi, WifiOff, RefreshCw, ClipboardList, ShoppingBag, ChevronDown, ChevronUp, UserPlus, X } from 'lucide-react'
import { supabase, consumeLoyaltyCode, recordPosCustomerVisit } from '../../../lib/supabase'
import {
  getPOSBranch, getPOSProducts, getPOSCategories,
  getPOSProductByBarcode, createPOSOrder, getOpenShift
} from '../lib/pos-supabase'
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
import BarcodeScanner from '../components/BarcodeScanner'
import { useAuth } from '../../../contexts/AuthContext'
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
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(isOnline())
  const [offlineQueue, setOfflineQueue] = useState(0)

  // Cart state
  const [cart, setCart] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  // Loyalty customer attached to the current order
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)

  // Online orders
  const [onlineOrders, setOnlineOrders] = useState([])
  const [showOnlineOrders, setShowOnlineOrders] = useState(false)
  const onlineOrdersTimer = useRef(null)

  // Modals
  const [showPayment, setShowPayment] = useState(null) // charge data
  const [showReceipt, setShowReceipt] = useState(null) // { order, items }
  const [showScanner, setShowScanner] = useState(false)

  // Load branch, products, categories
  useEffect(() => {
    const load = async () => {
      try {
        const [b, s] = await Promise.all([
          getPOSBranch(branchId),
          getOpenShift(branchId),
        ])
        setBranch(b)
        setShift(s)

        if (isOnline()) {
          const [prods, cats] = await Promise.all([
            getPOSProducts(branchId),
            getPOSCategories(branchId),
          ])
          setProducts(prods)
          setCategories(cats)
          // Cache for offline
          cacheProducts(branchId, prods).catch(() => {})
          cacheCategories(branchId, cats).catch(() => {})
        } else {
          const [prods, cats] = await Promise.all([
            getCachedProducts(branchId),
            getCachedCategories(branchId),
          ])
          setProducts(prods)
          setCategories(cats)
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
          .select('id,order_number,customer_name,customer_phone,total,table_number,created_at,awaiting_staff_confirm,pickup_code')
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

  // Add product to cart
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...prev, {
        id: newItemId(),
        product_id: product.id,
        name: product.name,
        name_ar: product.name_ar,
        price: parseFloat(product.price),
        quantity: 1,
        track_inventory: product.track_inventory,
        notes: '',
      }]
    })
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

  // Handle barcode scan
  const handleScan = async (result) => {
    setShowScanner(false)
    try {
      const product = await getPOSProductByBarcode(branchId, result)
      addToCart(product)
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
    const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)
    const cartDiscount = showPayment.discountAmount || 0
    const loyaltyDiscount = paymentData.loyalty_discount_amount || 0
    const discountAmount = cartDiscount + loyaltyDiscount
    const total = Math.max(0, subtotal - discountAmount)

    // Strip loyalty fields not in pos_orders schema
    const { loyalty_reward_id, loyalty_discount_amount, ...paymentDataForOrder } = paymentData

    const orderData = {
      branch_id: branchId,
      shift_id: shift?.id || null,
      subtotal,
      discount_amount: discountAmount,
      discount_pct: showPayment.discountType === 'pct' ? (showPayment.discountValue || 0) : 0,
      total,
      ...paymentDataForOrder,
      synced: isOnline(),
    }

    const items = cart.map(i => ({
      product_id: i.product_id,
      product_name: i.name,
      product_name_ar: i.name_ar,
      unit_price: i.price,
      quantity: i.quantity,
      total: i.price * i.quantity,
      track_inventory: i.track_inventory,
      notes: i.notes,
    }))

    try {
      let order
      if (isOnline()) {
        order = await createPOSOrder(orderData, items)
      } else {
        const localId = await queueOfflineOrder({ ...orderData, items })
        setOfflineQueue(q => q + 1)
        // Create a fake order for receipt display
        order = {
          ...orderData,
          id: `offline-${localId}`,
          order_number: `OFFLINE-${localId}`,
          created_at: new Date().toISOString(),
        }
        toast('Order saved offline. Will sync when online.', { icon: '📴' })
      }

      // Consume loyalty reward if one was applied (only after order persisted)
      if (loyalty_reward_id && order?.id && !String(order.id).startsWith('offline-')) {
        try {
          const result = await consumeLoyaltyCode(loyalty_reward_id, order.id)
          if (!result?.success) {
            toast.error('Loyalty reward could not be consumed — please verify in admin')
          }
        } catch (err) {
          toast.error('Loyalty consume failed: ' + (err.message || 'unknown'))
        }
      } else if (loyalty_reward_id && String(order.id || '').startsWith('offline-')) {
        toast('Loyalty redemption queued — will reconcile when online', { icon: '📴' })
      }

      // Record passport visit (bumps last_visit_at, total_visits, backfills favorite_drink)
      const visitCustomerId = paymentData.loyalty_customer_id || loyaltyCustomer?.id || null
      if (visitCustomerId && !String(order.id || '').startsWith('offline-')) {
        try {
          const firstItemName = items[0]?.product_name || null
          await recordPosCustomerVisit(visitCustomerId, firstItemName)
        } catch {
          // non-fatal — don't block sale completion on memory update
        }
      }

      setShowPayment(null)
      setShowReceipt({ order, items, loyaltyCustomer: loyaltyCustomer || (visitCustomerId ? { id: visitCustomerId } : null) })
      setCart([])
      setLoyaltyCustomer(null)
    } catch (err) {
      toast.error(err.message || 'Failed to complete sale')
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-noch-dark flex items-center justify-center">
      <p className="text-noch-muted">Loading terminal...</p>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-noch-dark overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-noch-card border-b border-noch-border shrink-0">
        <button onClick={() => navigate('/pos')} className="text-noch-muted hover:text-white p-1">
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
        <button onClick={() => setShowScanner(true)} className="p-2 text-noch-muted hover:text-white">
          <ScanLine size={18} />
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
            searchQuery={searchQuery}
          />
        </div>

        {/* Divider */}
        <div className="w-px bg-noch-border shrink-0" />

        {/* Cart panel — right 40% */}
        <div className="flex-[2] p-3 overflow-hidden flex flex-col min-w-[240px]">
          {/* Customer chip */}
          <div className="mb-2 shrink-0">
            {loyaltyCustomer ? (
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
                  onClick={() => setShowCustomerSearch(true)}
                  className="text-noch-muted hover:text-white text-xs px-2"
                  title="Swap"
                >
                  Swap
                </button>
                <button
                  onClick={() => setLoyaltyCustomer(null)}
                  className="text-noch-muted hover:text-white p-1"
                  title="Detach"
                >
                  <X size={14} />
                </button>
              </div>
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
          />
        </div>
      </div>

      {/* Modals */}
      {showScanner && (
        <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {showPayment && (
        <PaymentModal
          total={showPayment.total}
          cartItems={cart}
          loyaltyCustomer={loyaltyCustomer}
          onComplete={handlePaymentComplete}
          onClose={() => setShowPayment(null)}
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
        />
      )}

      {showCustomerSearch && (
        <CustomerSearchModal
          onSelect={(c) => { setLoyaltyCustomer(c); setShowCustomerSearch(false) }}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}
    </div>
  )
}

function CustomerSearchModal({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-20" onClick={onClose}>
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-noch-border">
          <h3 className="text-white font-bold">Attach customer</h3>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
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
  )
}
