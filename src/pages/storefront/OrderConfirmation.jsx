import { useLocation, useNavigate } from 'react-router-dom'
import './styles/OrderConfirmation.css'

export default function OrderConfirmation() {
  const location = useLocation()
  const navigate = useNavigate()

  const { order, paymentMethod, total, branch } = location.state || {}

  if (!order) {
    return (
      <div className="confirmation-container">
        <div className="error-state">
          <h1>Order Not Found</h1>
          <p>There was an issue with your order. Please try again.</p>
        </div>
      </div>
    )
  }

  const paymentLabels = {
    pickup: 'In-Store Pickup',
    bank_transfer: 'Bank Transfer',
    cod: 'Cash on Delivery'
  }

  return (
    <div className="confirmation-container">
      <div className="confirmation-card">
        <div className="success-icon">✓</div>

        <h1>Order Confirmed!</h1>
        <p className="confirmation-message">
          Thank you for your order. We've sent a confirmation to your phone via WhatsApp.
        </p>

        {/* Order Details */}
        <div className="confirmation-details">
          <div className="detail-row">
            <span>Order Number:</span>
            <strong>{order.order_number}</strong>
          </div>

          <div className="detail-row">
            <span>Total Amount:</span>
            <strong>{total?.toFixed(2)} LYD</strong>
          </div>

          <div className="detail-row">
            <span>Payment Method:</span>
            <strong>{paymentLabels[paymentMethod] || paymentMethod}</strong>
          </div>

          {branch && (
            <div className="detail-row">
              <span>Location:</span>
              <strong>{branch.name}</strong>
            </div>
          )}
        </div>

        {/* Payment Instructions */}
        <div className="payment-instructions">
          <h2>Next Steps</h2>

          {paymentMethod === 'pickup' && (
            <div className="instruction">
              <h3>📍 In-Store Pickup</h3>
              <p>Your order is being prepared. Pick it up at {branch?.name || 'the store'}.</p>
            </div>
          )}

          {paymentMethod === 'bank_transfer' && (
            <div className="instruction">
              <h3>💳 Bank Transfer</h3>
              <p>
                Payment details have been sent to your WhatsApp. Please transfer the amount
                and send us proof.
              </p>
            </div>
          )}

          {paymentMethod === 'cod' && (
            <div className="instruction">
              <h3>💰 Cash on Delivery</h3>
              <p>
                Pay when your order is delivered. We'll contact you via WhatsApp with the
                estimated delivery time.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="confirmation-actions">
          <button className="btn-back" onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}
