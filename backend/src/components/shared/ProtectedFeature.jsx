// ProtectedFeature.jsx — Conditionally renders children based on permission
// Usage:
//   <ProtectedFeature feature="pos" action="void_order">
//     <VoidButton />
//   </ProtectedFeature>
//
//   <ProtectedFeature feature="staff" action="salaries" fallback={<p>No access</p>}>
//     <SalaryView />
//   </ProtectedFeature>

import { usePermission } from '../../lib/usePermission'

export default function ProtectedFeature({ feature, action, fallback = null, children }) {
  const can = usePermission()
  if (!can(feature, action)) return fallback
  return children
}

// AccessDenied — reusable fallback component
export function AccessDenied({ message = 'Access restricted' }) {
  return (
    <div className="flex items-center justify-center py-12 text-center">
      <div>
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-noch-muted text-sm">{message}</p>
      </div>
    </div>
  )
}
