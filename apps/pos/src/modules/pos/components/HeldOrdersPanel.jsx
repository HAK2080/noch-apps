// HeldOrdersPanel.jsx — list of parked (held) orders for the current branch.
// Local-only (IndexedDB). Each row can be Resumed (restores the cart exactly)
// or Cancelled (deleted). Held orders never count as sales until charged.

import { PauseCircle, X, Trash2, RotateCcw } from 'lucide-react'
import { translations } from '../../../lib/i18n'
import { format } from '../lib/money'

const t = (key, lang) =>
  translations[lang === 'ar' ? 'ar' : 'en']?.[key] || translations.en?.[key] || key

function itemCount(record) {
  return (record.cart || []).reduce((s, i) => s + (i.quantity || 0), 0)
}

export default function HeldOrdersPanel({ heldOrders = [], onResume, onCancel, onClose, posLang = 'en' }) {
  const tr = (k) => t(k, posLang)
  return (
    <div className="bg-noch-card border-b border-noch-border shrink-0 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold text-sm flex items-center gap-2">
          <PauseCircle size={14} className="text-yellow-400" />
          {tr('posHeldOrders')}
          {heldOrders.length === 0 && (
            <span className="text-noch-muted font-normal">({tr('posHeldEmpty')})</span>
          )}
        </h2>
        <button onClick={onClose} className="text-noch-muted hover:text-white">
          <X size={14} />
        </button>
      </div>

      {heldOrders.length > 0 ? (
        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pos-scroll">
          {heldOrders.map(order => (
            <div
              key={order.local_id}
              className="rounded-lg px-3 py-2 text-sm border bg-noch-dark border-yellow-500/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-white font-medium truncate">{order.label}</span>
                  <span className="text-noch-muted text-xs">
                    {itemCount(order)} {tr('posItems')}
                    {order.served_by?.full_name ? ` · ${order.served_by.full_name}` : ''}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-white font-semibold">{format(order.total || 0)} LYD</span>
                  <span className="text-noch-muted text-xs">
                    {order.held_at
                      ? new Date(order.held_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onCancel(order)}
                  className="flex-1 py-1 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium flex items-center justify-center gap-1"
                >
                  <Trash2 size={12} /> {tr('posCancelHeld')}
                </button>
                <button
                  onClick={() => onResume(order)}
                  className="flex-1 py-1 text-xs rounded-lg bg-noch-green text-black hover:bg-noch-green/80 font-bold flex items-center justify-center gap-1"
                >
                  <RotateCcw size={12} /> {tr('posResume')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-noch-muted text-sm">{tr('posHeldEmpty')}.</p>
      )}
    </div>
  )
}
