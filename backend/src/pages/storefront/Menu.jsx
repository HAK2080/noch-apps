import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './styles/Menu.css'

export default function Menu() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tableNumber = searchParams.get('table')
  const [branch, setBranch] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [cart, setCart] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadMenuData()
  }, [branchId])

  async function loadMenuData() {
    try {
      setLoading(true)
      setError(null)

      // Load branch
      const { data: branchData, error: branchErr } = await supabase
        .from('pos_branches')
        .select('*')
        .eq('id', branchId)
        .eq('is_active', true)
        .single()

      if (branchErr) throw new Error('Branch not found')
      setBranch(branchData)

      // Load categories
      const { data: catData, error: catErr } = await supabase
        .from('pos_categories')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name')

      if (catErr) throw catErr
      setCategories(catData || [])

      // Load products
      const { data: prodData, error: prodErr } = await supabase
        .from('pos_products')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name')

      if (prodErr) throw prodErr
      setProducts(prodData || [])
    } catch (err) {
      console.error('Error loading menu:', err)
      setError(err.message || 'Failed to load menu')
    } finally {
      setLoading(false)
    }
  }

  function handleAddToCart(product) {
    setCart(prev => ({
      ...prev,
      [product.id]: (prev[product.id] || 0) + 1
    }))
  }

  function handleRemoveFromCart(productId) {
    setCart(prev => {
      const newCart = { ...prev }
      if (newCart[productId] > 1) {
        newCart[productId]--
      } else {
        delete newCart[productId]
      }
      return newCart
    })
  }

  function getCartTotal() {
    return Object.entries(cart).reduce((total, [productId, qty]) => {
      const product = products.find(p => p.id === productId)
      return total + (product?.price || 0) * qty
    }, 0)
  }

  function getCartCount() {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  }

  function handleCheckout() {
    if (getCartCount() === 0) return
    navigate(`/checkout/${branchId}`, { state: { cart, branch, tableNumber } })
  }

  const filteredProducts =
    selectedCategory === 'all'
      ? products
      : products.filter(p => p.category_id === selectedCategory)

  if (loading) return <div className="menu-loading">Loading menu...</div>
  if (error) return <div className="menu-error">Error: {error}</div>
  if (!branch) return <div className="menu-error">Branch not found</div>

  return (
    <div className="menu-container">
      <div className="menu-header">
        <h1>{branch.name}</h1>
        <p className="menu-address">{branch.address || 'Order now'}</p>
        {tableNumber && (
          <div className="table-badge">📍 Table {tableNumber}</div>
        )}
      </div>

      {/* Categories */}
      <div className="categories-filter">
        <button
          className={`cat-btn ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="products-grid">
        {filteredProducts.length === 0 ? (
          <p className="no-products">No products available</p>
        ) : (
          filteredProducts.map(product => {
            const qty = cart[product.id] || 0
            return (
              <div key={product.id} className="product-card">
                <div className="product-header">
                  <h3>{product.name}</h3>
                  {product.name_ar && <p className="product-name-ar">{product.name_ar}</p>}
                </div>
                <p className="product-price">{product.price.toFixed(2)} LYD</p>
                <div className="product-actions">
                  {qty === 0 ? (
                    <button
                      className="btn-add"
                      onClick={() => handleAddToCart(product)}
                    >
                      Add to Order
                    </button>
                  ) : (
                    <div className="qty-control">
                      <button
                        className="qty-btn"
                        onClick={() => handleRemoveFromCart(product.id)}
                      >
                        −
                      </button>
                      <span className="qty-display">{qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => handleAddToCart(product)}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Cart Summary */}
      {getCartCount() > 0 && (
        <div className="cart-summary">
          <div className="cart-info">
            <span className="cart-count">{getCartCount()} items</span>
            <span className="cart-total">{getCartTotal().toFixed(2)} LYD</span>
          </div>
          <button className="btn-checkout" onClick={handleCheckout}>
            Proceed to Checkout
          </button>
        </div>
      )}
    </div>
  )
}
