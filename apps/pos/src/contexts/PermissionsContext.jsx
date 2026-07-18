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
  const { profile, loading: authLoading } = useAuth()
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)

  const isOwner = profile?.role === 'owner'

  useEffect(() => {
    // AuthProvider may have a user before its profile request completes. Keep
    // permission-gated routes waiting during that gap instead of treating the
    // missing profile as a confirmed lack of access and redirecting away.
    if (authLoading) {
      setLoading(true)
      return
    }
    if (!profile) {
      setPermissions({})
      setLoading(false)
      return
    }
    setLoading(true)
    if (isOwner) {
      setPermissions({ all: { can_access: true, can_edit: true } })
      setLoading(false)
      return
    }
    const load = async () => {
      try {
        const query = supabase.from('role_permissions').select('*').eq('role', profile.role)
        const timeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Permission check timed out')), 8000)
        })
        const { data, error } = await Promise.race([query, timeout])
        if (error) throw error
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
  }, [authLoading, profile, isOwner])

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
