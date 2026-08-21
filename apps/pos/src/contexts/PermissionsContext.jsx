/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { canAccessPolicy, getLandingRoute, isAccountEnabled } from '../lib/access-control'
import { cacheRolePermissions, getCachedRolePermissions } from '../lib/permission-cache'

const PermissionsContext = createContext({
  hasAccess: () => false,
  canEdit: () => false,
  canAccess: () => false,
  loading: true,
  isOwner: false,
  accountEnabled: false,
  permissions: {},
  error: null,
  refreshedAt: null,
  landingRoute: '/staff/my-profile',
  reloadPermissions: async () => {},
})

export function PermissionsProvider({ children }) {
  const { profile, loading: authLoading } = useAuth()
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshedAt, setRefreshedAt] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const isOwner = profile?.role === 'owner'
  const accountEnabled = isAccountEnabled(profile)

  useEffect(() => {
    let cancelled = false
    let timeoutId

    if (authLoading) {
      setLoading(true)
      return () => { cancelled = true }
    }
    if (!profile) {
      setPermissions({})
      setError(null)
      setRefreshedAt(null)
      setLoading(false)
      return () => { cancelled = true }
    }

    if (isOwner) {
      setPermissions({ all: { can_access: true, can_edit: true } })
      setError(null)
      setRefreshedAt(new Date())
      setLoading(false)
      return () => { cancelled = true }
    }

    const cachedPermissions = getCachedRolePermissions(profile.role)
    if (cachedPermissions) {
      setPermissions(cachedPermissions)
      setError(null)
      setLoading(false)
    }

    const load = async () => {
      if (!cachedPermissions) setLoading(true)
      setError(null)
      try {
        const query = supabase
          .from('role_permissions')
          .select('feature, can_access, can_edit')
          .eq('role', profile.role)
        const timeout = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Permission check timed out')), 8000)
        })
        const { data, error: queryError } = await Promise.race([query, timeout])
        if (queryError) throw queryError
        if (cancelled) return

        const map = {}
        data?.forEach(grant => {
          map[grant.feature] = {
            can_access: !!grant.can_access,
            can_edit: !!grant.can_access && !!grant.can_edit,
          }
        })
        cacheRolePermissions(profile.role, map)
        setPermissions(map)
        setRefreshedAt(new Date())
      } catch (loadError) {
        if (cancelled) return
        if (cachedPermissions) {
          // A recent successful access decision is allowed to keep a known POS
          // device operational during a café internet outage. It is replaced
          // on the next successful refresh and expires after seven days.
          setPermissions(cachedPermissions)
          setError(null)
        } else {
          setPermissions({})
          setRefreshedAt(null)
          setError(loadError instanceof Error ? loadError : new Error('Unable to verify permissions'))
        }
      } finally {
        if (!cancelled) setLoading(false)
        clearTimeout(timeoutId)
      }
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [authLoading, isOwner, profile, reloadKey])

  const context = useMemo(() => ({ profile, permissions, isOwner }), [isOwner, permissions, profile])
  const canAccess = useCallback(policy => canAccessPolicy(policy, context), [context])
  const hasAccess = useCallback(feature => canAccessPolicy({ type: 'feature', feature }, context), [context])
  const canEdit = useCallback(feature => canAccessPolicy({ type: 'feature', feature, mode: 'edit' }, context), [context])
  const reloadPermissions = useCallback(async () => setReloadKey(key => key + 1), [])
  const landingRoute = useMemo(() => getLandingRoute(context), [context])

  const value = useMemo(() => ({
    hasAccess,
    canEdit,
    canAccess,
    loading,
    isOwner,
    accountEnabled,
    permissions,
    error,
    refreshedAt,
    landingRoute,
    reloadPermissions,
  }), [accountEnabled, canAccess, canEdit, error, hasAccess, isOwner, landingRoute, loading, permissions, refreshedAt, reloadPermissions])

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export const usePermissions = () => useContext(PermissionsContext)
