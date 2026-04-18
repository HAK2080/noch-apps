// POSHome.jsx — Branch selector for POS
// Route: /pos

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, MapPin, Plus, Clock } from 'lucide-react'
import { getPOSBranches, getOpenShift, openShift } from '../lib/pos-supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Layout from '../../../components/Layout'
import POSPinLogin from './POSPinLogin'
import toast from 'react-hot-toast'

function BranchCard({ branch, onOpen, onSelect }) {
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOpenShift(branch.id)
      .then(setShift)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [branch.id])

  const handleClick = () => {
    if (!loading) onSelect(branch)
  }

  return (
    <div className="card hover:border-noch-green/30 transition-all cursor-pointer" onClick={handleClick}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-white font-bold text-lg">{branch.name}</h3>
          {branch.name_ar && (
            <p className="text-noch-muted text-sm" dir="rtl">{branch.name_ar}</p>
          )}
        </div>
        <ShoppingCart size={20} className="text-noch-green shrink-0 mt-1" />
      </div>

      {branch.location && (
        <div className="flex items-center gap-1.5 text-noch-muted text-sm mb-3">
          <MapPin size={12} />
          <span>{branch.location}</span>
        </div>
      )}

      {/* Shift status */}
      <div className="border-t border-noch-border pt-3">
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
      </div>
    </div>
  )
}

export default function POSHome() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [openingShift, setOpeningShift] = useState(null) // branch being opened
  const [openingCash, setOpeningCash] = useState('')
  const [pinTarget, setPinTarget] = useState(null) // branch awaiting PIN
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    getPOSBranches()
      .then(setBranches)
      .catch(() => toast.error('Failed to load branches'))
      .finally(() => setLoading(false))
  }, [])

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
    <Layout>
      <p className="text-noch-muted text-center py-16">Loading branches...</p>
    </Layout>
  )

  // Show PIN login overlay if branch selected
  if (pinTarget) {
    return (
      <POSPinLogin
        branchId={pinTarget.id}
        onSuccess={() => navigate(`/pos/${pinTarget.id}`)}
        onSkip={() => navigate(`/pos/${pinTarget.id}`)}
      />
    )
  }

  return (
    <Layout>
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
              onSelect={(b) => setPinTarget(b)}
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
    </Layout>
  )
}
