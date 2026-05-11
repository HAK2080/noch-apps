// POSSettings.jsx — POS settings: printer, branch, cash drawer
// Route: /pos/:branchId/settings

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, DollarSign, Store, Package, Settings, AlertTriangle, ClipboardList, Bluetooth, Usb, ToggleLeft, BarChart3 } from 'lucide-react'
import { getPOSBranch, updatePOSBranch, getOpenShift, openShift } from '../lib/pos-supabase'
import { getPOSSettings, updatePOSSettings, clearPOSSettingsCache } from '../lib/pos-settings'
import {
  connectPrinter, disconnectPrinter, isPrinterConnected,
  printTestPage, openCashDrawer,
  getTransport, setTransport, isTransportAvailable, getTransportLabel,
} from '../lib/escpos'
import { useAuth } from '../../../contexts/AuthContext'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

function FlagRow({ label, hint, value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-start gap-3 text-left p-2 rounded-lg hover:bg-noch-border/30 transition-colors"
    >
      <span
        className={`mt-1 inline-flex w-9 h-5 rounded-full transition-colors shrink-0 ${
          value ? 'bg-noch-green' : 'bg-noch-border'
        }`}
      >
        <span
          className={`block w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-white text-sm font-medium">{label}</span>
        {hint && <span className="block text-noch-muted text-xs mt-0.5">{hint}</span>}
      </span>
    </button>
  )
}

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
  const [transport, setTransportState] = useState(getTransport())
  const [editing, setEditing] = useState(false)
  const [branchForm, setBranchForm] = useState({})
  const [savingBranch, setSavingBranch] = useState(false)
  const [openingCash, setOpeningCash] = useState('')
  const [openingShift, setOpeningShift] = useState(false)
  const [posSettings, setPosSettings] = useState(null)
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem('noch_auto_print') === 'true')

  const serialAvailable = isTransportAvailable('serial')
  const bluetoothAvailable = isTransportAvailable('bluetooth')
  const transportAvailable = isTransportAvailable(transport)

  useEffect(() => {
    Promise.all([
      getPOSBranch(branchId),
      getOpenShift(branchId),
      getPOSSettings(branchId),
    ])
      .then(([b, s, ps]) => {
        setBranch(b)
        setShift(s)
        setPosSettings(ps)
        setBranchForm({
          receipt_header: b.receipt_header || '',
          receipt_footer: b.receipt_footer || '',
          phone: b.phone || '',
        })
      })
      .catch(err => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [branchId])

  const handleAutoPrintToggle = (value) => {
    setAutoPrint(value)
    localStorage.setItem('noch_auto_print', value ? 'true' : 'false')
    toast(value ? 'Auto-print enabled' : 'Auto-print disabled', { icon: '🖨️' })
  }

  const handleToggleFlag = async (flag, value) => {
    setPosSettings(s => ({ ...s, [flag]: value }))
    try {
      clearPOSSettingsCache(branchId)
      await updatePOSSettings(branchId, { [flag]: value })
    } catch (err) {
      // Revert on failure
      setPosSettings(s => ({ ...s, [flag]: !value }))
      toast.error(err.message || 'Could not save setting')
    }
  }

  const handleConnectPrinter = async () => {
    if (printerConnected) {
      await disconnectPrinter()
      setPrinterConnected(false)
      toast('Printer disconnected')
      return
    }
    setConnecting(true)
    try {
      // Façade routes to the active transport. Baud rate is only used by
      // the serial transport; bluetooth ignores it.
      await connectPrinter(transport === 'serial' ? { baudRate } : {})
      setPrinterConnected(true)
      toast.success(`Connected via ${getTransportLabel()}`)
    } catch (err) {
      toast.error(err.message || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleTransportChange = (kind) => {
    if (kind === transport) return
    setTransport(kind)
    setTransportState(kind)
    setPrinterConnected(isPrinterConnected())
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

          {/* Transport selector — Bluetooth (default on Android tablets) or
              USB Serial. Each option is hidden when its underlying browser
              API isn't available, so a desktop without Bluetooth won't
              show a dead BT button. */}
          {(bluetoothAvailable || serialAvailable) && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => handleTransportChange('bluetooth')}
                disabled={!bluetoothAvailable || printerConnected}
                className={`flex items-center justify-center gap-2 py-2 rounded-xl border text-sm transition-all ${
                  transport === 'bluetooth'
                    ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                    : 'border-noch-border text-noch-muted hover:border-noch-green/20'
                } ${(!bluetoothAvailable || printerConnected) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Bluetooth size={14} />
                Bluetooth
              </button>
              <button
                onClick={() => handleTransportChange('serial')}
                disabled={!serialAvailable || printerConnected}
                className={`flex items-center justify-center gap-2 py-2 rounded-xl border text-sm transition-all ${
                  transport === 'serial'
                    ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                    : 'border-noch-border text-noch-muted hover:border-noch-green/20'
                } ${(!serialAvailable || printerConnected) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Usb size={14} />
                USB Serial
              </button>
            </div>
          )}

          {!transportAvailable && (
            <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2 mb-4 flex items-start gap-2">
              <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-yellow-300 text-xs">
                {transport === 'bluetooth'
                  ? 'Web Bluetooth is not available in this browser. Use Chrome on Android (or desktop with Bluetooth enabled).'
                  : 'Web Serial is not available in this browser. Use Chrome/Edge on HTTPS or localhost.'}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            <div className={`w-2 h-2 rounded-full ${printerConnected ? 'bg-noch-green' : 'bg-noch-muted'}`} />
            <span className="text-sm text-white">
              {printerConnected
                ? `Connected — ${getTransportLabel()}`
                : `Not connected (${getTransportLabel()})`}
            </span>
          </div>

          {!printerConnected && transport === 'serial' && (
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
              disabled={connecting || !transportAvailable}
              className={`flex-1 py-2 rounded-xl font-medium text-sm transition-all ${
                printerConnected
                  ? 'btn-secondary border-red-400/30 text-red-400 hover:bg-red-400/10'
                  : 'btn-primary'
              }`}
            >
              {connecting
                ? 'Connecting...'
                : printerConnected
                  ? 'Disconnect'
                  : transport === 'bluetooth'
                    ? 'Connect Bluetooth Printer'
                    : 'Connect USB Printer'}
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

        {/* Modifiers quick link */}
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-noch-green" />
              <div>
                <h2 className="text-white font-semibold">Modifiers</h2>
                <p className="text-noch-muted text-xs mt-0.5">Drink options: milk, syrup, sugar, size</p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/pos/${branchId}/modifiers`)}
              className="btn-primary text-xs px-3 py-1"
            >
              Manage
            </button>
          </div>
        </div>

        {/* Reports quick link */}
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-noch-green" />
              <div>
                <h2 className="text-white font-semibold">Sales Reports</h2>
                <p className="text-noch-muted text-xs mt-0.5">Today, week, month, by product, by barista</p>
              </div>
            </div>
            <button
              onClick={() => navigate(`/pos/${branchId}/reports`)}
              className="btn-primary text-xs px-3 py-1"
            >
              Open
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

        {/* Feature flags — per-branch toggles. Defaults match the
            user's choices on 2026-05-07: out-of-stock blocking off,
            manager-override off, per-barista-shift off. PIN required
            is on by default and recommended on for any branch with
            staff. */}
        {posSettings && (
          <div className="card mb-4">
            <div className="flex items-center gap-2 mb-3">
              <ToggleLeft size={16} className="text-noch-green" />
              <h2 className="text-white font-semibold">POS Behaviour</h2>
            </div>
            <div className="flex flex-col gap-3">
              <FlagRow
                label="Block sale of out-of-stock items"
                hint="When on, products with stock ≤ 0 cannot be added to the cart. Off = current behaviour."
                value={!!posSettings.block_out_of_stock}
                onChange={v => handleToggleFlag('block_out_of_stock', v)}
              />
              <FlagRow
                label="Require PIN to use POS"
                hint="When on, the terminal cannot be opened without a verified staff PIN. Records `served_by` on every order."
                value={posSettings.require_pin !== false}
                onChange={v => handleToggleFlag('require_pin', v)}
              />
              <FlagRow
                label="Manager override (coming soon)"
                hint="When on, baristas above their discount cap or attempting a void/refund prompt for a manager PIN. Wired but not yet active."
                value={!!posSettings.manager_override_enabled}
                onChange={v => handleToggleFlag('manager_override_enabled', v)}
              />
              <FlagRow
                label="Per-barista shift attendees (coming soon)"
                hint="When on, multiple staff clock in/out on the same shift with per-barista totals. Wired but not yet active."
                value={!!posSettings.per_barista_shift}
                onChange={v => handleToggleFlag('per_barista_shift', v)}
              />
              <FlagRow
                label="Auto-print receipt on order completion"
                hint="When on, the receipt is sent to the printer automatically after each sale — no need to tap 'Print Receipt' manually. Requires printer to be connected."
                value={autoPrint}
                onChange={handleAutoPrintToggle}
              />
            </div>
          </div>
        )}

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
