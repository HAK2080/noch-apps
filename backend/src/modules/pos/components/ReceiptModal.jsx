// ReceiptModal.jsx — Post-sale receipt preview and actions

import { useState } from 'react'
import { X, Printer, DollarSign, Plus } from 'lucide-react'
import { printReceipt, openCashDrawer, isPrinterConnected } from '../lib/escpos'
import toast from 'react-hot-toast'

export default function ReceiptModal({ order, items, branch, onNewOrder, onClose }) {
  const [printing, setPrinting] = useState(false)
  const [openingDrawer, setOpeningDrawer] = useState(false)

  const handlePrint = async () => {
    if (!isPrinterConnected()) {
      toast.error('Printer not connected. Go to Settings to connect.')
      return
    }
    setPrinting(true)
    try {
      await printReceipt(order, branch, items)
      toast.success('Receipt printed')
    } catch (err) {
      toast.error(err.message || 'Print failed')
    } finally {
      setPrinting(false)
    }
  }

  const handleOpenDrawer = async () => {
    if (!isPrinterConnected()) {
      toast.error('Printer not connected.')
      return
    }
    setOpeningDrawer(true)
    try {
      await openCashDrawer()
      toast.success('Cash drawer opened')
    } catch (err) {
      toast.error(err.message || 'Failed to open drawer')
    } finally {
      setOpeningDrawer(false)
    }
  }

  const now = new Date(order.created_at || Date.now())
  const dateStr = now.toLocaleDateString('en-GB')
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-noch-border">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-noch-green rounded-full flex items-center justify-center">
                <span className="text-noch-dark text-xs font-bold">✓</span>
              </div>
              <h2 className="text-white font-bold text-lg">Sale Complete</h2>
            </div>
            <p className="text-noch-muted text-sm mt-0.5">{order.order_number}</p>
          </div>
          <button onClick={onClose} className="text-noch-muted hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Receipt preview */}
        <div className="p-5">
          <div className="bg-noch-dark border border-noch-border rounded-xl p-4 font-mono text-xs mb-5">
            <div className="text-center mb-2">
              <p className="text-white font-bold">{branch?.receipt_header || branch?.name}</p>
              <p className="text-noch-muted">{dateStr} {timeStr}</p>
              <p className="text-noch-muted">#{order.order_number}</p>
            </div>
            <div className="border-t border-dashed border-noch-border my-2" />

            {/* Items */}
            {items.map((item, i) => (
              <div key={i} className="flex justify-between mb-1">
                <span className="text-white flex-1 truncate">{item.product_name || item.name}</span>
                <span className="text-noch-muted ml-2 shrink-0">
                  {item.quantity}x {parseFloat(item.unit_price || item.price).toFixed(2)}
                </span>
              </div>
            ))}

            <div className="border-t border-dashed border-noch-border my-2" />
            <div className="flex justify-between text-noch-muted">
              <span>Subtotal</span>
              <span>{parseFloat(order.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(order.discount_amount) > 0 && (
              <div className="flex justify-between text-yellow-400">
                <span>Discount</span>
                <span>-{parseFloat(order.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold text-sm mt-1">
              <span>TOTAL</span>
              <span>{parseFloat(order.total).toFixed(2)} LYD</span>
            </div>

            {order.payment_method === 'cash' && order.cash_tendered && (
              <>
                <div className="flex justify-between text-noch-muted mt-1">
                  <span>Cash</span>
                  <span>{parseFloat(order.cash_tendered).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-noch-green">
                  <span>Change</span>
                  <span>{parseFloat(order.change_due || 0).toFixed(2)}</span>
                </div>
              </>
            )}

            <div className="border-t border-dashed border-noch-border mt-2 pt-2 text-center text-noch-muted" dir="rtl">
              {branch?.receipt_footer || 'شكراً لزيارتكم'}
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="btn-secondary flex items-center justify-center gap-2 py-3"
            >
              <Printer size={16} />
              {printing ? 'Printing...' : 'Print'}
            </button>
            <button
              onClick={handleOpenDrawer}
              disabled={openingDrawer}
              className="btn-secondary flex items-center justify-center gap-2 py-3"
            >
              <DollarSign size={16} />
              {openingDrawer ? 'Opening...' : 'Open Drawer'}
            </button>
          </div>

          <button
            onClick={onNewOrder}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            New Order
          </button>
        </div>
      </div>
    </div>
  )
}
