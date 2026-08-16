// POSHome.jsx — Branch selector for POS
// Route: /pos

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, MapPin, Plus, Clock, Trash2, Power, AlertTriangle } from 'lucide-react'
import { getPOSBranches, getOpenShift, openShift, updatePOSBranch } from '../lib/pos-supabase'
import {
  BRANCH_CUSTOMER_STATUSES,
  branchCustomerStatusUpdate,
  getBranchCustomerStatus,
  isBranchSelectable,
} from '../lib/branch-availability'
import { useAuth } from '../../../contexts/AuthContext'
import Layout from '../../../components/Layout'
import { isKioskMode } from '../lib/pos-kiosk'
import toast from 'react-hot-toast'

// In kiosk mode we render a minimal full-screen branch picker instead
// of wrapping in <Layout> (which adds the app sidebar/back-to-dashboard).
function KioskWrapper({ children }) {
  return <div className="min-h-screen bg-noch-dark px-4 py-8 sm:py-12">{children}</div>
}

function BranchCard({ branch, onOpen, onSelect, onWaste, onStatusChange, canManage }) {
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const isActive = isBranchSelectable(branch)
  const customerStatus = getBranchCustomerStatus(branch)

  useEffect(() => {
    getOpenShift(branch.id)
      .then(setShift)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [branch.id])

  const handleClick = () => {
    if (!loading && isActive) onSelect(branch)
  }

  return (
    <div className={`card transition-all ${isActive ? 'hover:border-noch-green/30 cursor-pointer' : 'opacity-75 border-amber-400/30'}`} onClick={handleClick}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-white font-bold text-lg">{branch.name}</h3>
          {branch.name_ar && (
            <p className="text-noch-muted text-sm" dir="rtl">{branch.name_ar}</p>
          )}
        </div>
        {isActive
          ? <ShoppingCart size={20} className="text-noch-green shrink-0 mt-1" />
          : <Power size={20} className="text-amber-400 shrink-0 mt-1" />}
      </div>

      {branch.location && (
        <div className="flex items-center gap-1.5 text-noch-muted text-sm mb-3">
          <MapPin size={12} />
          <span>{branch.location}</span>
        </div>
      )}

      {!isActive ? (
        <div className="border-t border-noch-border pt-3">
          <div className="flex items-start gap-2 text-amber-300 text-sm">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {customerStatus === 'pre_opening'
                ? 'Customers see this branch as Coming Soon, but cannot select it.'
                : 'This branch is hidden from customers and unavailable in the POS.'}
            </span>
          </div>
        </div>
      ) : <div className="border-t border-noch-border pt-3">
        {loading ? (
          <p className="text-noch-muted text-xs">Loading shift...</p>
        ) : shift ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-noch-green text-sm">
              <Clock size={12} />
              <span>Shift open</span>
            </div>
            <span className="text-noch-muted text-xs">
              {new Date(shift.opened_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-noch-muted text-sm">No open shift</span>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(branch) }}
              className="btn-primary text-xs px-3 py-1"
            >
              <Plus size={10} className="inline mr-1" />
              Open Shift
            </button>
          </div>
        )}
      </div>}

      {canManage && (
        <div className="mt-3 rounded-xl border border-noch-border bg-black/10 p-3" onClick={event => event.stopPropagation()}>
          <label className="text-noch-muted text-xs font-medium block mb-1.5" htmlFor={`branch-customer-status-${branch.id}`}>
            Customer visibility
          </label>
          <select
            id={`branch-customer-status-${branch.id}`}
            value={customerStatus}
            onChange={event => onStatusChange(branch, event.target.value)}
            className="input w-full text-sm"
          >
            {BRANCH_CUSTOMER_STATUSES.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="text-noch-muted text-[11px] mt-1.5">
            Operational is selectable, Coming Soon is visible but disabled, and Hidden is not shown.
          </p>
        </div>
      )}

      {/* Report waste */}
      {isActive && (
        <button
          onClick={(e) => { e.stopPropagation(); onWaste(branch) }}
          className="btn-secondary text-xs px-3 py-1.5 mt-3 w-full flex items-center justify-center gap-1.5"
        >
          <Trash2 size={12} />
          Report waste
        </button>
      )}
    </div>
  )
}

export default function POSHome() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [openingShift, setOpeningShift] = useState(null) // branch being opened
  const [openingCash, setOpeningCash] = useState('')
  const { user, isOwner } = useAuth()
  const navigate = useNavigate()
  const kiosk = isKioskMode()
  const Wrapper = kiosk ? KioskWrapper : Layout

  useEffect(() => {
    getPOSBranches({ includeInactive: isOwner })
      .then(setBranches)
      .catch(() => toast.error('Failed to load branches'))
      .finally(() => setLoading(false))
  }, [isOwner])

  const setBranchCustomerStatus = async (branch, nextStatus) => {
    if (nextStatus === getBranchCustomerStatus(branch)) return
    if (nextStatus !== 'operating' && !window.confirm(
      nextStatus === 'pre_opening'
        ? `Show ${branch.name} as Coming Soon? It will be unavailable in the POS and customer menu.`
        : `Hide ${branch.name}? It will disappear from customer branch lists and be unavailable in the POS.`,
    )) return
    if (nextStatus !== 'operating') {
      const openShift = await getOpenShift(branch.id).catch(() => null)
      if (openShift) {
        toast.error('Close the open shift before changing this branch availability.')
        return
      }
    }
    try {
      const updated = await updatePOSBranch(branch.id, branchCustomerStatusUpdate(nextStatus))
      setBranches(current => current.map(item => item.id === branch.id ? { ...item, ...updated } : item))
      const label = BRANCH_CUSTOMER_STATUSES.find(option => option.value === nextStatus)?.label || 'updated'
      toast.success(`${branch.name}: ${label}`)
    } catch (error) {
      toast.error(error.message || 'Failed to update branch availability')
    }
  }

  const handleOpenShift = async () => {
    if (!openingShift) return
    try {
      await openShift(openingShift.id, parseFloat(openingCash) || 0, user?.id)
      toast.success('Shift opened')
      setOpeningShift(null)
      navigate(`/pos/${openingShift.id}`)
    } catch (err) {
      toast.error(err.message || 'Failed to open shift')
    }
  }

  if (loading) return (
    <Wrapper>
      <p className="text-noch-muted text-center py-16">Loading branches...</p>
    </Wrapper>
  )

  return (
    <Wrapper>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-white font-bold text-2xl flex items-center gap-2">
            <ShoppingCart size={22} className="text-noch-green" />
            Point of Sale
          </h1>
          <p className="text-noch-muted text-sm mt-1">Select a branch to start selling</p>
        </div>

        {/* Branch cards */}
        <div className="grid gap-4">
          {branches.map(branch => (
            <BranchCard
              key={branch.id}
              branch={branch}
              onOpen={(b) => { setOpeningShift(b); setOpeningCash('') }}
              onSelect={(b) => navigate(`/pos/${b.id}`)}
              onWaste={(b) => navigate(`/pos/${b.id}/waste`)}
              onStatusChange={setBranchCustomerStatus}
              canManage={isOwner}
            />
          ))}
        </div>

        {branches.length === 0 && (
          <div className="card text-center py-12">
            <ShoppingCart size={40} className="text-noch-muted mx-auto mb-3" />
            <p className="text-noch-muted">No branches found. Run the database migration first.</p>
          </div>
        )}
      </div>

      {/* Open Shift Modal */}
      {openingShift && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-xs p-6">
            <h2 className="text-white font-bold text-lg mb-1">Open Shift</h2>
            <p className="text-noch-muted text-sm mb-5">{openingShift.name}</p>

            <label className="label block mb-1">Opening Cash (LYD)</label>
            <input
              type="number"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              placeholder="0.000"
              className="input w-full mb-4"
              min="0"
              step="0.001"
              autoFocus
            />

            <div className="flex gap-3">
              <button onClick={() => setOpeningShift(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleOpenShift} className="btn-primary flex-1">
                Open
              </button>
            </div>
          </div>
        </div>
      )}
    </Wrapper>
  )
}
