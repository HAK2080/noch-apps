// PermissionContext.jsx — RBAC permission system
// Fetches current user's role + granted permissions on mount
// aerohaith@gmail.com always has all permissions (owner)

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const PermissionContext = createContext({
  permissions: new Set(),
  userRole: null,
  hasPermission: () => false,
  loading: true,
  refetch: () => {},
})

export function usePermissions() {
  return useContext(PermissionContext)
}

export function PermissionProvider({ children }) {
  const { user, profile } = useAuth()
  const [permissions, setPermissions] = useState(new Set())
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const OWNER_EMAIL = 'aerohaith@gmail.com'

  async function fetchPermissions(userId, userEmail) {
    // Owner always gets all permissions
    if (userEmail === OWNER_EMAIL || profile?.role === 'owner') {
      // Fetch all permission keys and grant them all
      const { data: allPerms } = await supabase
        .from('app_permissions')
        .select('feature, action')
      const permSet = new Set((allPerms || []).map(p => `${p.feature}.${p.action}`))
      // Always ensure owner role object
      setUserRole({ name: 'owner', level: 5 })
      setPermissions(permSet)
      return
    }

    // Fetch user's assigned role
    const { data: prof } = await supabase
      .from('profiles')
      .select('app_role_id, app_roles:app_role_id(id, name, level, description)')
      .eq('id', userId)
      .single()

    if (!prof?.app_role_id) {
      // No role assigned — minimal permissions
      setPermissions(new Set())
      setUserRole(null)
      return
    }

    const role = prof.app_roles
    setUserRole(role)

    // Fetch granted permissions for this role
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('granted, permission:app_permissions(feature, action)')
      .eq('role_id', prof.app_role_id)
      .eq('granted', true)

    const permSet = new Set(
      (rolePerms || [])
        .filter(rp => rp.granted && rp.permission)
        .map(rp => `${rp.permission.feature}.${rp.permission.action}`)
    )
    setPermissions(permSet)
  }

  async function load() {
    if (!user) {
      setPermissions(new Set())
      setUserRole(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      await fetchPermissions(user.id, user.email)
    } catch (err) {
      console.error('PermissionContext: failed to load permissions', err)
      setPermissions(new Set())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [user?.id, profile?.role])

  function hasPermission(feature, action) {
    // Owner email always has all permissions
    if (user?.email === OWNER_EMAIL || profile?.role === 'owner') return true
    return permissions.has(`${feature}.${action}`)
  }

  return (
    <PermissionContext.Provider value={{ permissions, userRole, hasPermission, loading, refetch: load }}>
      {children}
    </PermissionContext.Provider>
  )
}
