// POSSettings.jsx — POS settings: printer, branch, cash drawer
// Route: /pos/:branchId/settings

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, DollarSign, Store, Package, Settings, AlertTriangle, ClipboardList } from 'lucide-react'
import { getPOSBranch, updatePOSBranch, getOpenShift, openShift } from '../lib/pos-supabase'
import {
  connectPrinter, disconnectPrinter, isPrinterConnected,
  printTestPage, openCashDrawer
} from '../lib/escpos'
import { useAuth } from '../../../contexts/AuthContext'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

export default function POSSettings() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [branch, setBranch] = useState(null)
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [printerConnected, setPrinterConnected] = useState(isPrinterConnected())
  const [connecting, setConnecting] = useState(false)
  const [baudRate, setBaudRate] = useState(9600)
  const [editing, setEditing] = useState(false)
  const [branchForm, setBranchForm] = useState({})
  const [savingBranch, setSavingBranch] = useState(false)
  const [openingCash, setOpeningCash] = useState('')
  const [openingShift, setOpeningShift] = useState(false)

  const serialAvailable = typeof navigator !== 'undefined' && 'serial' in navigator

  useEffect(() => {
    Promise.all([getPOSBranch(branchId), getOpenShift(branchId)])
      .then(([b, s]) => {
        setBranch(b)
        setShift(s)
        setBranchForm({
          receipt_header: b.receipt_header || '',
          receipt_footer: b.receipt_footer || '',
          phone: b.phone || '',
        })
      })
      .catch(err => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [branchId])

  const handleConnectPrinter = async () => {
    if (printerConnected) {
      await disconnectPrinter()
      setPrinterConnected(false)
      toast('Printer disconnected')
      return
    }
    setConnecting(true)
    try {
      await connectPrinter(baudRate)
      setPrinterConnected(true)
      toast.success('Printer connected!')
    } catch (err) {
      toast.error(err.message || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleTestPrint = async () => {
    try {
      await printTestPage()
      toast.success('Test page printed')
    } catch (err) {
      toast.error(err.message || 'Print failed')
    }
  }

  const handleOpenDrawer = async () => {
    try {
      await openCashDrawer()
      toast.success('Cash drawer opened')
    } catch (err) {
      toast.error(err.message || 'Failed to open drawer')
    }
  }

  const handleSaveBranch = async () => {
    setSavingBranch(true)
    try {
      const updated = await updatePOSBranch(branchId, branchForm)
      setBranch(updated)
      setEditing(false)
      toast.success('Branch info saved')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSavingBranch(false)
    }
  }

  const handleOpenShift = async () => {
    setOpeningShift(true)
    try {
      const s = await openShift(branchId, parseFloat(openingCash) || 0, user?.id)
      setShift(s)
      toast.success('Shift opened')
    } catch (err) {
      toast.error(err.message || 'Failed to open shift')
    } finally {
      setOpeningShift(false)
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Settings size={18} className="text-noch-green" />
              POS Settings
            </h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
        </div>

        {/* Printer Setup */}
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Printer size={16} className="text-noch-green" />
            <h2 className="text-white font-semibold">Printer Setup</h2>
          </div>

          {!serialAvailable && (
            <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2 mb-4 flex items-start gap-2">
              <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-yellow-300 text-xs">
                Web Serial API requires Chrome/Edge on HTTPS or localhost.
                Printer features are not available in this browser.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            <div className={`w-2 h-2 rounded-full ${printerConnected ? 'bg-noch-green' : 'bg-noch-muted'}`} />
            <span className="text-sm text-white">
              {printerConnected ? 'Connected — XPrinter NP-N200L' : 'Not connected'}
            </span>
          </div>

          {!printerConnected && (
            <div className="mb-3">
              <label className="label block mb-1">Baud Rate</label>
              <select
                value={baudRate}
                onChange={e => setBaudRate(Number(e.target.value))}
                className="input py-1.5 text-sm"
              >
                <option value={9600}>9600</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={115200}>115200</option>
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConnectPrinter}
              disabled={connecting || !serialAvailable}
              className={`flex-1 py-2 rounded-xl font-medium text-sm transition-all ${
                printerConnected
                  ? 'btn-secondary border-red-400/30 text-red-400 hover:bg-red-400/10'
                  : 'btn-primary'
              }`}
            >
              {connecting ? 'Connecting...' : printerConnected ? 'Disconnect' : 'Connect Printer'}
            </button>
            {printerConnected && (
              <button onClick={handleTestPrint} className="btn-secondary flex-1 py-2 text-sm">
                Test Print
              </button>
            )}
          </div>
        </div>

        {/* Cash Drawer */}
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-noch-green" />
            <h2 className="text-white font-semibold">Cash Drawer</h2>
          </div>
          <p className="text-noch-muted text-sm mb-3">24V cash drawer — triggered via printer kick command</p>
          <button
            onClick={handleOpenDrawer}
            disabled={!printerConnected}
            className="btn-secondary w-full py-2 text-sm"
          >
            {printerConnected ? 'Test Open Drawer' : 'Connect printer first'}
          </button>
        </div>

        {/* Branch Info */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Store size={16} className="text-noch-green" />
              <h2 className="text-white font-semibold">Branch Info</h2>
            </div>
            {!editing && (
              <button onClick={() => setEditing(true)} className="btn-secondary text-xs px-3 py-1">
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="label block mb-1">Receipt Header</label>
                <input
                  type="text"
                  value={branchForm.receipt_header}
                  onChange={e => setBranchForm(f => ({ ...f, receipt_header: e.target.value }))}
                  className="input w-full"
                  placeholder="NOCH CAFÉ - Branch Name"
                />
              </div>
              <div>
                <label className="label block mb-1">Receipt Footer</label>
                <input
                  type="text"
                  value={branchForm.receipt_footer}
                  onChange={e => setBranchForm(f => ({ ...f, receipt_footer: e.target.value }))}
                  className="input w-full"
                  placeholder="شكراً لزيارتكم"
                />
              </div>
              <div>
                <label className="label block mb-1">Phone</label>
                <input
                  type="text"
                  value={branchForm.phone}
                  onChange={e => setBranchForm(f => ({ ...f, phone: e.target.value }))}
                  className="input w-full"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleSaveBranch} disabled={savingBranch} className="btn-primary flex-1">
                  {savingBranch ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-noch-muted">Name</span>
                <span className="text-white">{branch?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-noch-muted">Receipt Header</span>
                <span className="text-white truncate ml-4 text-right">{branch?.receipt_header || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-noch-muted">Receipt Footer</span>
                <span className="text-white" dir="rtl">{branch?.receipt_footer || '—'}</span>
              </div>
              {branch?.phone && (
                <div className="flex justify-between">
                  <span className="text-noch-muted">Phone</span>
                  <span className="text-white">{branch.phone}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Products quick link */}
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-noch-green" />
              <h2 className="text-white font-semibold">Products & Categories</h2>
            </div>
            <button
              onClick={() => navigate(`/pos/${branchId}/products`)}
              className="btn-primary text-xs px-3 py-1"
            >
              Manage
            </button>
          </div>
        </div>

        {/* Stock Check quick link */}
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-noch-green" />
              <div>
                <h2 className="text-white font-semibold">Weekly Stock Check</h2>
                <p className="text-noch-muted text-xs mt-0.5">Critical / Important / Low priority items</p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/pos/${branchId}/stock-check`)}
              className="btn-primary text-xs px-3 py-1"
            >
              Open
            </button>
          </div>
        </div>

        {/* Shift */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-noch-green" />
            <h2 className="text-white font-semibold">Shift</h2>
          </div>

          {shift ? (
            <div className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-noch-muted">Status</span>
                <span className="text-noch-green font-medium">Open</span>
              </div>
              <div className="flex justify-between">
                <span className="text-noch-muted">Opened</span>
                <span className="text-white">
                  {new Date(shift.opened_at).toLocaleString('en-GB')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-noch-muted">Opening Cash</span>
                <span className="text-white">{parseFloat(shift.opening_cash).toFixed(3)} LYD</span>
              </div>
              <button
                onClick={() => navigate(`/pos/${branchId}/end-of-day`)}
                className="btn-secondary w-full mt-3 text-sm"
              >
                End of Day / Close Shift
              </button>
            </div>
          ) : (
            <div>
              <p className="text-noch-muted text-sm mb-3">No open shift</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Opening cash (LYD)"
                  value={openingCash}
                  onChange={e => setOpeningCash(e.target.value)}
                  className="input flex-1 text-sm"
                  step="0.001"
                />
                <button
                  onClick={handleOpenShift}
                  disabled={openingShift}
                  className="btn-primary text-sm px-4"
                >
                  {openingShift ? '...' : 'Open Shift'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
