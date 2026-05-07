import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './styles/Checkout.css'

export default function Checkout() {
  const { branchId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [cart, setCart] = useState({})
  const [products, setProducts] = useState([])
  const [branch, setBranch] = useState(null)
  const [tableNumber, setTableNumber] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('pickup')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Get cart from location state
    if (location.state?.cart) {
      setCart(location.state.cart)
    }
    if (location.state?.branch) {
      setBranch(location.state.branch)
    }
    if (location.state?.tableNumber) {
      setTableNumber(location.state.tableNumber)
    }
    loadProducts()
  }, [branchId])

  async function loadProducts() {
    try {
      const { data, error: err } = await supabase
        .from('pos_products')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)

      if (err) throw err
      setProducts(data || [])
    } catch (err) {
      console.error('Error loading products:', err)
      setError('Failed to load product details')
    }
  }

  function getOrderItems() {
    return Object.entries(cart)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        product_id: productId,
        quantity: qty
      }))
  }

  function getCartTotal() {
    return Object.entries(cart).reduce((total, [productId, qty]) => {
      const product = products.find(p => p.id === productId)
      return total + (product?.price || 0) * qty
    }, 0)
  }

  async function handleSubmitOrder(e) {
    e.preventDefault()
    setError(null)

    // Validate
    if (!customerName.trim()) {
      setError('Please enter your name')
      return
    }
    if (!customerPhone.trim()) {
      setError('Please enter your phone number')
      return
    }
    if (getOrderItems().length === 0) {
      setError('Cart is empty')
      return
    }

    try {
      setLoading(true)

      const items = getOrderItems()
      const { data, error: err } = await supabase.rpc('submit_guest_order', {
        p_branch_id: branchId,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_payment_method: paymentMethod,
        p_items: items,
        p_table_number: tableNumber || null
      })

      if (err) throw err
      if (data.error) throw new Error(data.error)

      // Success - navigate to confirmation
      navigate('/order-confirmation', {
        state: {
          order: data,
          paymentMethod,
          total: getCartTotal(),
          branch
        }
      })
    } catch (err) {
      console.error('Error submitting order:', err)
      setError(err.message || 'Failed to submit order. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const cartItems = getOrderItems()
  const total = getCartTotal()

  return (
    <div className="checkout-container">
      <h1>Order Summary</h1>

      {error && <div className="checkout-error">{error}</div>}

      {/* Table number badge */}
      {tableNumber && (
        <div className="checkout-table-badge">
          📍 Dine-in — Table {tableNumber}
        </div>
      )}

      {/* Order Items */}
      <div className="checkout-items">
        <h2>Items ({cartItems.length})</h2>
        {cartItems.map(item => {
          const product = products.find(p => p.id === item.product_id)
          if (!product) return null
          return (
            <div key={item.product_id} className="checkout-item">
              <div className="item-details">
                <p className="item-name">{product.name}</p>
                <p className="item-qty">Qty: {item.quantity}</p>
              </div>
              <p className="item-price">
                {(product.price * item.quantity).toFixed(2)} LYD
              </p>
            </div>
          )
        })}
        <div className="checkout-total">
          <strong>Total:</strong>
          <strong>{total.toFixed(2)} LYD</strong>
        </div>
      </div>

      {/* Customer Form */}
      <form className="checkout-form" onSubmit={handleSubmitOrder}>
        <h2>Your Information</h2>

        <div className="form-group">
          <label htmlFor="name">Full Name *</label>
          <input
            id="name"
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Your full name"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone Number *</label>
          <input
            id="phone"
            type="tel"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="+218..."
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="payment">Payment Method *</label>
          <select
            id="payment"
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            disabled={loading}
          >
            <option value="pickup">In-Store Pickup</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cod">Cash on Delivery</option>
          </select>
        </div>

        {paymentMethod === 'bank_transfer' && (
          <div className="payment-note">
            <p>
              <strong>Bank Transfer:</strong> You will receive payment details via
              WhatsApp after order confirmation.
            </p>
          </div>
        )}

        {paymentMethod === 'cod' && (
          <div className="payment-note">
            <p>
              <strong>Cash on Delivery:</strong> Pay when your order arrives.
            </p>
          </div>
        )}

        <button
          type="submit"
          className="btn-submit-order"
          disabled={loading || cartItems.length === 0}
        >
          {loading ? 'Submitting...' : 'Submit Order'}
        </button>
      </form>
    </div>
  )
}
