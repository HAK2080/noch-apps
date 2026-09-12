import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import CEOOverview from '../../src/modules/finance/CEOOverview'
import ProductGrid from '../../src/modules/pos/components/ProductGrid'
import { LanguageProvider } from '../../src/contexts/LanguageContext'
import '../../src/index.css'

// eslint-disable-next-line react-refresh/only-export-components
function StockFixture() {
  const [blocked, setBlocked] = useState(true)
  const [count, setCount] = useState(0)
  return <div className="p-6 h-screen bg-noch-dark"><button onClick={() => setBlocked(!blocked)}>Toggle stock</button><p>Cart: {count}</p>
    <ProductGrid products={[{ id: 'cake', name: 'Chocolate cake', price: 20, sale_blocked: blocked, sale_block_reason: 'Stock not set up', image_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="brown"/%3E%3C/svg%3E' }]}
      onSelect={() => setCount(value => value + 1)} />
  </div>
}

createRoot(document.getElementById('root')).render(<MemoryRouter><LanguageProvider>
  {location.search.includes('stock') ? <StockFixture /> : <CEOOverview />}
</LanguageProvider></MemoryRouter>)
