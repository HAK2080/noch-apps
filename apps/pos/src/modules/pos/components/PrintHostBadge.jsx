// PrintHostBadge.jsx — small corner indicator showing whether the
// print host tablet is online. Green dot = host present; red = no host.
// Shown only on non-host tablets (the host already knows it's the host).

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { observeHostPresence, isPrintHost } from '../lib/print-queue'

export default function PrintHostBadge({ branchId }) {
  const [host, setHost] = useState(null)

  useEffect(() => {
    if (!branchId) return
    // Don't show on the host tablet itself.
    if (isPrintHost()) return
    return observeHostPresence(branchId, setHost)
  }, [branchId])

  if (!branchId || isPrintHost()) return null

  const online = !!host
  const color = online ? 'bg-noch-green' : 'bg-red-500'
  const label = online ? 'Printer ready' : 'No host — prints will queue'

  return (
    <div
      className="fixed bottom-3 right-3 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-noch-card border border-noch-border shadow-lg"
      title={online ? `Host: ${host?.deviceId?.slice(0, 16) || 'connected'}` : 'No print host detected on this branch'}
    >
      <span className={`w-2 h-2 rounded-full ${color} ${online ? '' : 'animate-pulse'}`} />
      <Printer size={12} className="text-noch-muted" />
      <span className="text-xs text-noch-muted">{label}</span>
    </div>
  )
}
