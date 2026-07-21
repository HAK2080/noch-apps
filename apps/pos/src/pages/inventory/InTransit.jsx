// InTransit.jsx — Stock shipped from warehouse but not yet received
// Route: /inventory/in-transit
// Data: inventory_in_transit view (computed: shipped - received), grouped
// here by destination branch.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Truck, RefreshCw } from 'lucide-react'
import Layout from '../../components/Layout'
import { listLocations, listInTransit } from './lib/warehouse'
import toast from 'react-hot-toast'

export default function InTransit() {
  const navigate = useNavigate()
  const [locations, setLocations] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [locs, transit] = await Promise.all([listLocations(), listInTransit()])
      setLocations(locs)
      setRows(transit)
    } catch (err) {
      toast.error(err.message || 'Failed to load in-transit stock')
    } finally {
      setLoading(false)
    }
  }

  // Group by destination location
  const groups = {}
  for (const r of rows) {
    if (!groups[r.to_location_id]) groups[r.to_location_id] = []
    groups[r.to_location_id].push(r)
  }
  const locationName = id => locations.find(l => l.id === id)?.name || 'Unknown branch'
  const sortedGroupIds = Object.keys(groups).sort((a, b) => locationName(a).localeCompare(locationName(b)))

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/inventory')} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Truck size={18} className="text-noch-green" />
              In Transit
            </h1>
            <p className="text-noch-muted text-sm">Shipped from warehouse, not yet received</p>
          </div>
          <button onClick={load} className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {loading ? (
          <p className="text-noch-muted text-center py-16 text-sm">Loading...</p>
        ) : sortedGroupIds.length === 0 ? (
          <div className="bg-noch-card border border-noch-border rounded-xl p-10 text-center">
            <Truck size={36} className="text-noch-muted mx-auto mb-3" />
            <p className="text-noch-muted text-sm">Nothing in transit right now</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedGroupIds.map(locId => {
              const items = groups[locId]
              const total = items.reduce((s, r) => s + (parseFloat(r.qty_in_transit) || 0), 0)
              return (
                <div key={locId} className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-noch-border flex items-center justify-between">
                    <h2 className="text-white font-semibold text-sm">{locationName(locId)}</h2>
                    <span className="text-amber-400 text-xs font-bold">{total} units inbound</span>
                  </div>
                  <div className="divide-y divide-noch-border/50">
                    {items.map((r, i) => (
                      <div key={`${r.product_id}-${i}`} className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-white text-sm truncate">{r.product_name || 'Unknown product'}</p>
                        <p className="text-amber-400 text-sm font-bold tabular-nums shrink-0 ml-3">
                          {parseFloat(r.qty_in_transit)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
