// ShareMenuModal.jsx — Share another branch's menu into this one, extracted from POSProducts.jsx
import { useState, useEffect } from 'react'
import { Copy, X } from 'lucide-react'
import { getPOSBranches, shareBranchMenu } from '../lib/pos-supabase'
import toast from 'react-hot-toast'

export default function ShareMenuModal({ targetBranchId, targetBranchName, onDone, onClose }) {
  const [branches, setBranches] = useState([])
  const [sourceId, setSourceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getPOSBranches()
      .then(b => setBranches((b || []).filter(x => x.id !== targetBranchId)))
      .catch(err => toast.error(err.message || 'Failed to load branches'))
      .finally(() => setLoading(false))
  }, [targetBranchId])

  const submit = async () => {
    if (!sourceId) return
    setSubmitting(true)
    try {
      const result = await shareBranchMenu(sourceId, targetBranchId)
      const sourceName = branches.find(b => b.id === sourceId)?.name || 'source'
      if (result.products === 0 && result.categories === 0) {
        toast(`Already shared — ${sourceName}'s menu is already visible at ${targetBranchName}.`, { icon: '👍' })
      } else {
        toast.success(
          `Shared from ${sourceName} → ${targetBranchName}: ${result.products} product${result.products === 1 ? '' : 's'}, ${result.categories} categor${result.categories === 1 ? 'y' : 'ies'}.`
        )
      }
      onDone()
    } catch (err) {
      toast.error(err.message || 'Share failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-noch-border">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Copy size={18} className="text-noch-green" />
            Share menu
          </h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5">
          <p className="text-noch-muted text-sm mb-4">
            Make another branch's products and categories also visible at <span className="text-white font-medium">{targetBranchName || 'this branch'}</span>. Nothing is duplicated — the same items appear in both branches.
          </p>

          {loading ? (
            <p className="text-noch-muted text-sm">Loading branches…</p>
          ) : branches.length === 0 ? (
            <p className="text-yellow-400 text-sm">No other branches found.</p>
          ) : (
            <>
              <label className="block text-noch-muted text-xs mb-1">Source branch</label>
              <select
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
                className="input w-full mb-4"
              >
                <option value="">— Pick a branch —</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              <p className="text-noch-muted text-[11px] mb-4">
                Safe to run more than once. Re-running adds nothing if the menu is already shared.
              </p>

              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={submit}
                  disabled={!sourceId || submitting}
                  className="btn-primary flex-1"
                >
                  {submitting ? 'Sharing…' : 'Share menu'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
