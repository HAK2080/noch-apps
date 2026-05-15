// Sales.jsx — Branch picker into Orders or Sessions views.
// Route: /sales
//
// Two ways to slice sales data:
//   Orders   — every individual transaction (search, refund, void, reprint)
//   Sessions — group by trading shift (best for cafes that cross midnight)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, Clock } from 'lucide-react'
import { getPOSBranches } from '../modules/pos/lib/pos-supabase'
import Layout from '../components/Layout'

export default function Sales() {
  const navigate = useNavigate()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPOSBranches()
      .then(list => {
        setBranches(list || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Layout>
        <p className="text-noch-muted text-center py-20">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-6">
        <h1 className="text-white font-bold text-2xl mb-2">Sales</h1>
        <p className="text-noch-muted text-sm mb-6">View orders or trading sessions for each branch</p>
        <div className="flex flex-col gap-4">
          {branches.map(b => (
            <div key={b.id} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-white font-semibold">{b.name}</p>
                  {b.address && <p className="text-noch-muted text-sm mt-0.5">{b.address}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate(`/pos/${b.id}/orders`)}
                  className="btn-secondary text-sm py-2 flex items-center justify-center gap-2"
                >
                  <ListOrdered size={14} /> Orders
                </button>
                <button
                  onClick={() => navigate(`/pos/${b.id}/sessions`)}
                  className="btn-secondary text-sm py-2 flex items-center justify-center gap-2"
                >
                  <Clock size={14} /> Sessions
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
