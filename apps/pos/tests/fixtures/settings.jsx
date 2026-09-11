import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import ApprovalSettings from '../../src/pages/expenses/ApprovalSettings'
import POSInstanceGate from '../../src/modules/pos/components/POSInstanceGate'
import '../../src/index.css'

// Test entry point, not a module: fast-refresh exports do not apply.
// eslint-disable-next-line react-refresh/only-export-components
function Cart() {
  const [value, setValue] = useState('')
  return <div><h1>Test terminal</h1><label>Cart note<input value={value} onChange={e => setValue(e.target.value)} /></label></div>
}
const query = new URLSearchParams(location.search)
createRoot(document.getElementById('root')).render(
  <StrictMode><MemoryRouter><Toaster />
    {query.get('view') === 'expenses'
      ? <div className="bg-noch-dark min-h-screen p-6"><ApprovalSettings /></div>
      : <POSInstanceGate branchId={query.get('branch') || 'branch-a'}><Cart /></POSInstanceGate>}
  </MemoryRouter></StrictMode>,
)
