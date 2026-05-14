// Sales.jsx — Branch picker that drops straight into POSOrders.
// Route: /sales
// If only one branch exists, redirects immediately. Otherwise shows
// a simple branch selector so the user never has to go through the
// POS terminal to find their orders.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPOSBranches } from '../modules/pos/lib/pos-supabase'
import Layout from '../components/Layout'

export default function Sales() {
  const navigate = useNavigate()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPOSBranches()
      .then(list => {
        if (list?.length === 1) {
          navigate(`/pos/${list[0].id}/orders`, { replace: true })
        } else {
          setBranches(list || [])
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [navigate])

  if (loading) {
    return (
      <Layout>
        <p className="text-noch-muted text-center py-20">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto py-10">
        <h1 className="text-white font-bold text-2xl mb-2">Sales</h1>
        <p className="text-noch-muted text-sm mb-6">Select a branch to view orders</p>
        <div className="flex flex-col gap-3">
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => navigate(`/pos/${b.id}/orders`)}
              className="card text-left px-5 py-4 hover:border-noch-green/40 transition-colors"
            >
              <p className="text-white font-semibold">{b.name}</p>
              {b.address && <p className="text-noch-muted text-sm mt-0.5">{b.address}</p>}
            </button>
          ))}
        </div>
      </div>
    </Layout>
  )
}
