import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import PaymentModal from '../../src/modules/pos/components/PaymentModal'
import ReceiptModal from '../../src/modules/pos/components/ReceiptModal'
import { NewOrderModal, OnlineOrderRow } from '../../src/modules/pos/pages/POSTerminal'
import LoyaltyCheckoutClaim from '../../src/modules/loyalty/pages/LoyaltyCheckoutClaim'
import ManagerOverrideModal from '../../src/modules/pos/components/ManagerOverrideModal'
import ProductModifierModal from '../../src/modules/pos/components/ProductModifierModal'
import '../../src/index.css'

const query = new URLSearchParams(location.search)
const lang = query.get('lang') || 'ar'
localStorage.setItem('pos-tile-lang', lang)
const order = { id: 'test-order', order_number: 'ONL-TEST-1', total: 23, subtotal: 23, status: 'pending', awaiting_staff_confirm: true, pickup_code: '1234', pos_order_items: [{ product_name_ar: 'لاتيه فانيليا بارد', quantity: 1, total: 23 }] }
const branch = { id: 'test-branch', name: 'نوتش' }
const complete = data => { document.getElementById('result').textContent = JSON.stringify(data) }
const view = query.get('view')
createRoot(document.getElementById('root')).render(
  <MemoryRouter><Toaster />
    <div id="result" />
    {view === 'online' ? <NewOrderModal order={order} branchId={branch.id} branch={branch} onAccept={() => complete('accepted')} onDecline={() => complete('declined')} />
      : view === 'collected' ? <OnlineOrderRow order={{ ...order, status: 'in_progress', awaiting_staff_confirm: false }} branchId={branch.id} branch={branch} onConfirmed={() => complete('collected')} onCancelled={() => complete('cancelled')} />
      : view === 'claim' ? <LoyaltyCheckoutClaim />
      : view === 'manager' ? <ManagerOverrideModal action="Approve a discount above the 10% staff cap." onApprove={complete} onClose={() => {}} />
      : view === 'modifiers' ? <ProductModifierModal product={{ id: 'test-product', name: 'Latte', name_ar: 'لاتيه', price: 15 }} groups={[{ id: 'milk', name: 'Milk', name_ar: 'الحليب', is_required: true, min_select: 1, max_select: 1, modifiers: [] }]} onAdd={complete} onClose={() => {}} />
      : view === 'receipt' ? <ReceiptModal order={order} items={[]} branch={branch} onNewOrder={() => {}} onClose={() => {}} />
      : <PaymentModal total={23} branchId={branch.id} posLang={lang === 'en' ? 'en' : 'ar'} onComplete={complete} onClose={() => {}} />}
  </MemoryRouter>,
)
