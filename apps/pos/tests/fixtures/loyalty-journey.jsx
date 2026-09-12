// Test-only real-component harness. No invented customer-display implementation.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { BrowserQRCodeReader } from '@zxing/browser'
import Menu from '../../src/pages/storefront/Menu'
import PaymentModal from '../../src/modules/pos/components/PaymentModal'
import LoyaltyCheckoutClaim from '../../src/modules/loyalty/pages/LoyaltyCheckoutClaim'
import ProductModifierModal from '../../src/modules/pos/components/ProductModifierModal'
import NochiAnimation from '../../src/modules/loyalty/components/NochiAnimation'
import '../../src/index.css'

const query = new URLSearchParams(location.search)
localStorage.setItem('pos-tile-lang', 'ar')
const complete = data => { document.getElementById('result').textContent = JSON.stringify(data) }
window.decodeTestQr = async source => (await new BrowserQRCodeReader().decodeFromImageUrl(source)).getText()
const branchId = '00000000-0000-4000-8000-000000000001'
const view = query.get('view') || 'menu'
// This standalone test entry deliberately mounts its own root.
// eslint-disable-next-line react-refresh/only-export-components
function AnimationFixture() {
  const [show, setShow] = useState(false)
  return <><button onClick={() => setShow(true)}>تشغيل التجربة</button><NochiAnimation type={query.get('type')} show={show} prize="جائزة تجريبية" onComplete={() => { setShow(false); complete('dismissed') }} /></>
}
createRoot(document.getElementById('root')).render(
  <MemoryRouter initialEntries={[view === 'claim' ? '/loyalty/checkout/test-token' : `/menu/${branchId}`]}>
    <Toaster /><output id="result" />
    {view === 'animation' ? <AnimationFixture /> : view === 'payment' ? <PaymentModal total={23} branchId={branchId} submitting={query.has('submitting')} onComplete={complete} onClose={() => complete('closed')} />
      : view === 'modifiers' ? <ProductModifierModal product={{ id: 'drink', name: 'Latte', name_ar: 'لاتيه', price: 23 }}
        groups={[{ id: 'milk', name: 'Milk', name_ar: 'الحليب', is_required: true, min_select: 1, max_select: 1,
          modifiers: [{ id: 'oat', name: 'Oat milk', name_ar: 'حليب الشوفان', price_delta: 3 }, { id: 'regular', name: 'Milk', name_ar: 'حليب عادي', price_delta: 0 }] }]}
        onAdd={complete} onClose={() => {}} />
        : <Routes><Route path="/menu/:branchId" element={<Menu />} /><Route path="/loyalty/checkout/:token" element={<LoyaltyCheckoutClaim />} /></Routes>}
  </MemoryRouter>,
)
