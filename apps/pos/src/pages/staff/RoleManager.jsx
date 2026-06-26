// RoleManager.jsx — RBAC role & permission management (role_permissions TEXT table)
// Route: /staff/roles

import { useState, useEffect } from 'react'
import { Shield, Check, X, Loader2, Bell, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getRolePermissions, updateRolePermission, approveRoleChange, denyRoleChange } from '../../lib/profiles'
import Layout from '../../components/Layout'
import { usePermission } from '../../lib/usePermission'
import { AccessDenied } from '../../components/shared/ProtectedFeature'
import { FEATURE_GROUPS } from '../../lib/features'
import toast from 'react-hot-toast'
const ROLES = ['supervisor', 'accountant', 'staff', 'limited_staff', 'data_entry']
const ROLE_COLORS = {
  supervisor:   'text-blue-400',
  accountant:   'text-green-400',
  staff:        'text-noch-green',
  limited_staff:'text-noch-muted',
  data_entry:   'text-orange-400',
}

export default function RoleManager() {
  const can = usePermission()
  if (!can('staff', 'edit')) {
    return <Layout><AccessDenied message="You don't have permission to manage roles." /></Layout>
  }

  // perms[role][feature] = { can_access, can_edit }
  const [perms, setPerms] = useState({})
  const [saving, setSaving] = useState({}) // { "role:feature": true }
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const [permsData, { data: reqData }] = await Promise.all([
        getRolePermissions(),
        supabase.from('profiles')
          .select('id, full_name, role, role_requested')
          .not('role_requested', 'is', null)
          .neq('role_requested', ''),
      ])

      const map = {}
      ROLES.forEach(r => { map[r] = {} })
      ;(permsData || []).forEach(p => {
        if (!map[p.role]) map[p.role] = {}
        map[p.role][p.feature] = { can_access: p.can_access, can_edit: p.can_edit }
      })
      setPerms(map)
      setRequests(reqData || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  // Each click cycles the cell: off → view → view + edit → off
  const toggleAccess = async (role, feature) => {
    const key = `${role}:${feature}`
    const current = perms[role]?.[feature] || { can_access: false, can_edit: false }
    let newAccess, newEdit
    if (!current.can_access) {
      newAccess = true; newEdit = false           // off → view
    } else if (!current.can_edit) {
      newAccess = true; newEdit = true            // view → view + edit
    } else {
      newAccess = false; newEdit = false          // view + edit → off
    }

    setPerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [feature]: { can_access: newAccess, can_edit: newEdit } },
    }))
    setSaving(s => ({ ...s, [key]: true }))

    try {
      await updateRolePermission(role, feature, newAccess, newEdit)
    } catch (err) {
      toast.error(err.message || 'Save failed')
      // revert
      setPerms(prev => ({
        ...prev,
        [role]: { ...prev[role], [feature]: current },
      }))
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  const handleApprove = async (staff) => {
    try {
      await approveRoleChange(staff.id, staff.role_requested)
      setRequests(prev => prev.filter(r => r.id !== staff.id))
      toast.success(`${staff.full_name} approved for ${staff.role_requested}`)
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const handleDeny = async (staff) => {
    try {
      await denyRoleChange(staff.id)
      setRequests(prev => prev.filter(r => r.id !== staff.id))
      toast('Request denied')
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Shield size={20} className="text-noch-green" />
          <h1 className="text-white font-bold text-xl">Role Manager</h1>
          {requests.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5 text-xs bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 px-2.5 py-1 rounded-full">
              <Bell size={11} />
              {requests.length} pending role request{requests.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Pending role requests */}
        {requests.length > 0 && (
          <div className="card mb-6 border-yellow-500/20">
            <h2 className="text-white font-semibold text-sm mb-3">Pending Role Requests</h2>
            <div className="flex flex-col gap-2">
              {requests.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-3 bg-noch-dark rounded-xl border border-noch-border">
                  <div>
                    <p className="text-white text-sm font-medium">{s.full_name}</p>
                    <p className="text-noch-muted text-xs">
                      Requesting: <span className="text-noch-green">{s.role_requested?.replace(/_/g, ' ')}</span>
                      {s.role && <span className="text-noch-muted"> (currently: {s.role.replace(/_/g, ' ')})</span>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(s)}
                      className="p-1.5 bg-noch-green/10 text-noch-green rounded-lg hover:bg-noch-green/20 transition-colors"
                      title="Approve"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => handleDeny(s)}
                      className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                      title="Deny"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Permission Matrix */}
        <div className="card overflow-x-auto">
          <p className="text-noch-muted text-xs mb-4">
            Owner column is always ON and locked.
            Click a cell to cycle: <span className="text-noch-muted/90">off</span>
            {' → '}<span className="text-noch-green">view</span>
            {' → '}<span className="text-blue-400">view + edit</span>
            {' → off'}. Saves immediately.
          </p>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-noch-muted font-medium text-xs w-48">Feature</th>
                {/* Owner — locked */}
                <th className="py-2 px-3 text-center text-purple-400 font-semibold text-xs">Owner</th>
                {ROLES.map(role => (
                  <th key={role} className={`py-2 px-3 text-center font-semibold text-xs ${ROLE_COLORS[role]}`}>
                    {role.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map(group => (
                <>
                  {/* Group header row */}
                  <tr key={group.label}>
                    <td colSpan={ROLES.length + 2} className="pt-4 pb-1 px-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-noch-muted/70">
                        {group.label}
                      </span>
                    </td>
                  </tr>
                  {group.features.map(f => (
                    <tr key={f.key} className="border-t border-noch-border/30 hover:bg-noch-dark/50 transition-colors">
                      <td className="py-2 px-3 text-white text-xs">{f.label}</td>
                      {/* Owner cell — locked */}
                      <td className="py-2 px-3 text-center">
                        <div className="w-5 h-5 rounded bg-purple-400/20 border border-purple-400/40 flex items-center justify-center mx-auto">
                          <Check size={10} className="text-purple-400" />
                        </div>
                      </td>
                      {ROLES.map(role => {
                        const key = `${role}:${f.key}`
                        const p = perms[role]?.[f.key] || { can_access: false, can_edit: false }
                        const isSaving = saving[key]
                        return (
                          <td key={role} className="py-2 px-3 text-center">
                            <button
                              onClick={() => toggleAccess(role, f.key)}
                              disabled={isSaving}
                              className={`w-6 h-6 rounded border flex items-center justify-center mx-auto transition-all ${
                                p.can_access && p.can_edit
                                  ? 'bg-blue-400/20 border-blue-400/50 text-blue-400 hover:bg-blue-400/30'
                                  : p.can_access
                                  ? 'bg-noch-green/20 border-noch-green/50 text-noch-green hover:bg-noch-green/30'
                                  : 'border-noch-border text-noch-muted hover:border-noch-green/30 hover:bg-noch-green/5'
                              }`}
                              title={`${role}: ${f.label} — ${
                                p.can_access && p.can_edit ? 'View + Edit' : p.can_access ? 'View only' : 'Disabled'
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : p.can_access && p.can_edit ? (
                                <Pencil size={10} />
                              ) : p.can_access ? (
                                <Check size={10} />
                              ) : (
                                <span className="w-1 h-1 rounded-full bg-noch-border inline-block" />
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>

          <p className="text-noch-muted text-xs mt-4">
            Changes save immediately. Refresh the page to see updated counts.
          </p>
        </div>
      </div>
    </Layout>
  )
}
