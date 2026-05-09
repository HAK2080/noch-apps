import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, AlertCircle, Info, Zap,
  CheckSquare, FileText, MessageSquare, ShoppingCart,
  FlaskConical, BellRing, CheckCircle2,
  ChevronRight, X, Check
} from 'lucide-react'
import { acceptSuggestedAction, dismissSuggestedAction, completeSuggestedAction, resolveBusinessEvent } from '../../lib/businessEvents'
import toast from 'react-hot-toast'

const severityStyles = {
  critical: { border: 'border-red-500/40', bg: 'bg-red-500/5', icon: <Zap size={14} className="text-red-400" />, badge: 'text-red-400 bg-red-500/15', label: 'Critical' },
  urgent:   { border: 'border-orange-500/40', bg: 'bg-orange-500/5', icon: <AlertTriangle size={14} className="text-orange-400" />, badge: 'text-orange-400 bg-orange-500/15', label: 'Urgent' },
  warning:  { border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', icon: <AlertCircle size={14} className="text-yellow-400" />, badge: 'text-yellow-400 bg-yellow-500/15', label: 'Warning' },
  info:     { border: 'border-noch-border', bg: 'bg-noch-card', icon: <Info size={14} className="text-blue-400" />, badge: 'text-blue-400 bg-blue-500/15', label: 'Info' },
}

const actionTypeIcon = {
  create_task:           <CheckSquare size={13} />,
  create_content_brief:  <FileText size={13} />,
  queue_message:         <MessageSquare size={13} />,
  create_procurement:    <ShoppingCart size={13} />,
  create_experiment:     <FlaskConical size={13} />,
  notify_staff:          <BellRing size={13} />,
  mark_resolved:         <CheckCircle2 size={13} />,
}

const moduleRoutes = {
  inventory: '/inventory/stock',
  loyalty:   '/loyalty/customers',
  pos:       '/pos',
  tasks:     '/tasks',
  content:   '/content-studio',
  analytics: '/analytics',
  staff:     '/staff',
}

export default function ActionCard({ action, onUpdate }) {
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const event = action.event
  const severity = event?.severity || 'info'
  const style = severityStyles[severity] || severityStyles.info

  async function handleAccept() {
    setBusy(true)
    try {
      await acceptSuggestedAction(action.id)
      toast.success('Action accepted')
      onUpdate?.()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDismiss() {
    setBusy(true)
    try {
      await dismissSuggestedAction(action.id)
      if (event?.id) await resolveBusinessEvent(event.id)
      onUpdate?.()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleComplete() {
    setBusy(true)
    try {
      await completeSuggestedAction(action.id)
      if (event?.id) await resolveBusinessEvent(event.id)
      toast.success('Marked as done')
      onUpdate?.()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  function handleOpen() {
    const route = moduleRoutes[action.target_module]
    if (route) navigate(route)
  }

  const moduleLabel = action.target_module
    ? action.target_module.charAt(0).toUpperCase() + action.target_module.slice(1)
    : ''

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 space-y-3`}>
      {/* Top row: severity + module + action type */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
            {style.icon}
            {style.label}
          </span>
          <span className="text-noch-muted text-[11px] uppercase tracking-wide">{moduleLabel}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-noch-muted text-[11px]">
          {actionTypeIcon[action.action_type]}
          {action.action_type?.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Summary from event */}
      {event?.summary && (
        <p className="text-noch-muted text-xs">{event.summary}</p>
      )}

      {/* Action title + reason */}
      <div>
        <p className="text-white text-sm font-semibold">{action.title}</p>
        <p className="text-noch-muted text-xs mt-0.5">{action.reason}</p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Open related module */}
        {moduleRoutes[action.target_module] && (
          <button
            onClick={handleOpen}
            className="inline-flex items-center gap-1 text-xs text-noch-green border border-noch-green/30 bg-noch-green/10 px-3 py-1.5 rounded-lg hover:bg-noch-green/20 transition-colors"
          >
            Open {moduleLabel} <ChevronRight size={12} />
          </button>
        )}

        {/* Accept */}
        {action.status === 'suggested' && (
          <button
            onClick={handleAccept}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-white bg-noch-green/20 border border-noch-green/40 px-3 py-1.5 rounded-lg hover:bg-noch-green/30 transition-colors disabled:opacity-50"
          >
            <Check size={12} /> Accept
          </button>
        )}

        {/* Mark resolved / complete */}
        {(action.status === 'suggested' || action.status === 'accepted') && (
          <button
            onClick={handleComplete}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-blue-400 border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={12} /> Done
          </button>
        )}

        {/* Dismiss */}
        {action.status !== 'dismissed' && action.status !== 'completed' && (
          <button
            onClick={handleDismiss}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-noch-muted border border-noch-border px-3 py-1.5 rounded-lg hover:text-white hover:border-noch-muted transition-colors disabled:opacity-50"
          >
            <X size={12} /> Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
