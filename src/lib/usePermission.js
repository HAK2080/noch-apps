// usePermission.js — convenience hook for permission checks
// Usage: const can = usePermission()
//        can('pos', 'void_order') → boolean

import { usePermissions } from '../contexts/PermissionContext'

export function usePermission() {
  const { hasPermission } = usePermissions()
  return hasPermission
}

export default usePermission
