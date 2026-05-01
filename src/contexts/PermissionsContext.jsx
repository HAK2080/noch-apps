// PermissionsContext.jsx — Role-based permissions.
// Reads from role_permissions(role TEXT, feature TEXT, can_access, can_edit).
// Owner status comes from profiles.role only — no email backdoor.

import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

const PermissionsContext = createContext({
  hasAccess: () => false,
  canEdit:   () => false,
  loading:   false,
  isOwner:   false,
  permissions: {},
})

export function PermissionsProvider({ children }) {
  const { profile } = useAuth()
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)

  const isOwner = profile?.role === 'owner'

  useEffect(() => {
    if (!profile) {
      setLoading(false)
      return
    }
    if (isOwner) {
      setPermissions({ all: { can_access: true, can_edit: true } })
      setLoading(false)
      return
    }
    const load = async () => {
      try {
        const { data } = await supabase
          .from('role_permissions')
          .select('*')
          .eq('role', profile.role)
        const map = {}
        data?.forEach(p => { map[p.feature] = { can_access: p.can_access, can_edit: p.can_edit } })
        setPermissions(map)
      } catch {
        setPermissions({})
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profile?.id, profile?.role, isOwner])

  const hasAccess = (feature) => {
    if (isOwner || !!permissions?.all?.can_access) return true
    return !!permissions[feature]?.can_access
  }
  const canEdit = (feature) => {
    if (isOwner || !!permissions?.all?.can_edit) return true
    return !!permissions[feature]?.can_edit
  }

  return (
    <PermissionsContext.Provider value={{ hasAccess, canEdit, loading, isOwner, permissions }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export const usePermissions = () => useContext(PermissionsContext)
