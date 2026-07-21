// Transfers.jsx — Warehouse work queues: ship requested, receive shipped
// Route: /inventory/transfers
// Ship is owner/supervisor only (enforced by the RPC too); receive is any staff.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, Truck, PackageCheck, Loader2, RefreshCw } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { formatStockQuantity } from '../../modules/pos/lib/inventory-units'
import { listLocations, listTransfers, shipTransfer, receiveTransfer } from './lib/warehouse'
import toast from 'react-hot-toast'

const STATUS_META = {
  requested: { label: 'Requested', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  shipped:   { label: 'Shipped',   cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  received:  { label: 'Received',  cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
  partial:   { label: 'Partial',   cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-noch-card text-noch-muted border-noch-border' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.cancelled
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
  )
}

function ShipRow({ transfer, locationName, onShip }) {
  const [qty, setQty] = useState(String(parseFloat(transfer.qty_requested)))
  const [busy, setBusy] = useState(false)

  async function handleShip() {
    const n = parseFloat(qty)
    if (!n || n <= 0) return toast.error('Enter a quantity above 0')
    setBusy(true)
    try {
      await onShip(transfer.id, n)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{transfer.product_name}</p>
        <p className="text-noch-muted text-xs">
          → {locationName(transfer.to_location_id)} · requested {formatStockQuantity(transfer.qty_requested, transfer.stock_display_unit)}
          {transfer.note && ` · ${transfer.note}`}
        </p>
      </div>
      <input
        type="number"
        min="0"
        step="0.01"
        value={qty}
        onChange={e => setQty(e.target.value)}
        className="input py-1 px-2 w-20 text-sm text-center shrink-0"
      />
      <button onClick={handleShip} disabled={busy} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shrink-0">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}
        Ship
      </button>
    </div>
  )
}

function ReceiveRow({ transfer, locationName, onReceive }) {
  const shipped = parseFloat(transfer.qty_shipped) || 0
  const [qty, setQty] = useState(String(shipped))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const arrived = parseFloat(qty)
  const isShort = Number.isFinite(arrived) && arrived < shipped

  async function handleReceive() {
    if (!Number.isFinite(arrived) || arrived < 0) return toast.error('Enter the arrived quantity')
    if (isShort && !reason.trim()) return toast.error('Discrepancy reason is required for a partial receipt')
    setBusy(true)
    try {
      await onReceive(transfer.id, arrived, reason.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{transfer.product_name}</p>
          <p className="text-noch-muted text-xs">
            → {locationName(transfer.to_location_id)} · shipped {formatStockQuantity(shipped, transfer.stock_display_unit)}
            {transfer.shipped_at && ` · ${new Date(transfer.shipped_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          value={qty}
          onChange={e => setQty(e.target.value)}
          className="input py-1 px-2 w-20 text-sm text-center shrink-0"
        />
        <button onClick={handleReceive} disabled={busy} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 shrink-0">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <PackageCheck size={12} />}
          Receive
        </button>
      </div>
      {isShort && (
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Discrepancy reason (required — arrived less than shipped)"
          className="input w-full py-1.5 text-sm border-orange-500/40"
        />
      )}
    </div>
  )
}

export default function Transfers() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canShip = profile?.role === 'owner' || profile?.role === 'supervisor'

  const [locations, setLocations] = useState([])
  const [toShip, setToShip] = useState([])
  const [toReceive, setToReceive] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const locationName = id => locations.find(l => l.id === id)?.name || '—'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [locs, requested, shipped, recent] = await Promise.all([
        listLocations(),
        listTransfers({ status: 'requested', limit: 100 }),
        listTransfers({ status: 'shipped', limit: 100 }),
        listTransfers({ limit: 50 }),
      ])
      setLocations(locs)
      setToShip(requested)
      setToReceive(shipped)
      setHistory(recent)
    } catch (err) {
      toast.error(err.message || 'Failed to load transfers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleShip(id, qty) {
    try {
      await shipTransfer(id, qty)
      toast.success('Transfer shipped')
      await load()
    } catch (err) {
      toast.error(err.message || 'Ship failed')
    }
  }

  async function handleReceive(id, qtyReceived, reason) {
    try {
      await receiveTransfer(id, qtyReceived, reason)
      toast.success('Transfer received')
      await load()
    } catch (err) {
      toast.error(err.message || 'Receive failed')
    }
  }

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
              <ArrowRightLeft size={18} className="text-noch-green" />
              Transfers
            </h1>
            <p className="text-noch-muted text-sm">Ship from warehouse, receive at branch</p>
          </div>
          <button onClick={load} className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {loading ? (
          <p className="text-noch-muted text-center py-16 text-sm">Loading...</p>
        ) : (
          <div className="space-y-6">
            {/* To ship */}
            <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-noch-border flex items-center justify-between">
                <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Truck size={14} className="text-amber-400" /> To ship
                </h2>
                <span className="text-noch-muted text-xs">{toShip.length}</span>
              </div>
              {toShip.length === 0 ? (
                <p className="text-noch-muted text-center py-8 text-sm">Nothing waiting to ship</p>
              ) : canShip ? (
                <div className="divide-y divide-noch-border/50">
                  {toShip.map(t => (
                    <ShipRow key={t.id} transfer={t} locationName={locationName} onShip={handleShip} />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-noch-border/50">
                  {toShip.map(t => (
                    <div key={t.id} className="px-4 py-3">
                      <p className="text-white text-sm font-medium truncate">{t.product_name}</p>
                      <p className="text-noch-muted text-xs">
                        → {locationName(t.to_location_id)} · requested {formatStockQuantity(t.qty_requested, t.stock_display_unit)}
                      </p>
                    </div>
                  ))}
                  <p className="text-noch-muted text-xs px-4 py-2 border-t border-noch-border/50">
                    Shipping is owner/supervisor only.
                  </p>
                </div>
              )}
            </div>

            {/* To receive */}
            <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-noch-border flex items-center justify-between">
                <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                  <PackageCheck size={14} className="text-noch-green" /> To receive
                </h2>
                <span className="text-noch-muted text-xs">{toReceive.length}</span>
              </div>
              {toReceive.length === 0 ? (
                <p className="text-noch-muted text-center py-8 text-sm">Nothing in transit to receive</p>
              ) : (
                <div className="divide-y divide-noch-border/50">
                  {toReceive.map(t => (
                    <ReceiveRow key={t.id} transfer={t} locationName={locationName} onReceive={handleReceive} />
                  ))}
                </div>
              )}
            </div>

            {/* History */}
            <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-noch-border">
                <h2 className="text-white font-semibold text-sm">Recent history</h2>
              </div>
              {history.length === 0 ? (
                <p className="text-noch-muted text-center py-8 text-sm">No transfers yet</p>
              ) : (
                <div className="divide-y divide-noch-border/50">
                  {history.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{t.product_name}</p>
                        <p className="text-noch-muted text-xs">
                          {locationName(t.from_location_id)} → {locationName(t.to_location_id)}
                          {' · req '}{formatStockQuantity(t.qty_requested, t.stock_display_unit)}
                          {t.qty_shipped != null && ` · ship ${formatStockQuantity(t.qty_shipped, t.stock_display_unit)}`}
                          {t.qty_received != null && ` · recv ${formatStockQuantity(t.qty_received, t.stock_display_unit)}`}
                          {t.discrepancy_reason && ` · ${t.discrepancy_reason}`}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
