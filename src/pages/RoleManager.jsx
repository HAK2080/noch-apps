// RoleManager.jsx — RBAC role and permission management
// Route: /staff/roles (owner only)

import { useState, useEffect } from 'react'
import { Shield, Check, X, ChevronRight, Users, Loader2, AlertCircle } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const ROLE_COLORS = {
  owner: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  supervisor: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  accountant: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  staff: 'text-noch-green bg-noch-green/10 border-noch-green/30',
  limited_staff: 'text-noch-muted bg-noch-muted/10 border-noch-muted/30',
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      title={disabled ? 'Owner always has full access' : undefined}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
        ${checked ? 'bg-noch-green' : 'bg-noch-border'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
          ${checked ? 'translate-x-5' : 'translate-x-1'}`}
      />
    </button>
  )
}

export default function RoleManager() {
  const { user } = useAuth()
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [rolePermMap, setRolePermMap] = useState({}) // roleId -> Set of permissionIds with granted=true
  const [roleRequests, setRoleRequests] = useState([])
  const [activeRoleId, setActiveRoleId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [rolesRes, permsRes, reqsRes] = await Promise.all([
        supabase.from('app_roles').select('*').order('level', { ascending: false }),
        supabase.from('app_permissions').select('*').order('feature').order('action'),
        supabase.from('role_requests')
          .select('*, user:profiles!role_requests_user_id_fkey(full_name, email), requested_role:app_roles!role_requests_requested_role_id_fkey(name, level)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ])

      const fetchedRoles = rolesRes.data || []
      setRoles(fetchedRoles)
      setPermissions(permsRes.data || [])
      setRoleRequests(reqsRes.data || [])

      // Load role permissions for all roles
      const { data: allRolePerms } = await supabase
        .from('role_permissions')
        .select('role_id, permission_id, granted')

      const map = {}
      for (const role of fetchedRoles) {
        map[role.id] = new Set(
          (allRolePerms || [])
            .filter(rp => rp.role_id === role.id && rp.granted)
            .map(rp => rp.permission_id)
        )
      }
      setRolePermMap(map)

      if (fetchedRoles.length > 0 && !activeRoleId) {
        setActiveRoleId(fetchedRoles[0].id)
      }
    } catch (err) {
      toast.error('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(roleId, permissionId, currentGranted) {
    const key = `${roleId}-${permissionId}`
    setSaving(prev => ({ ...prev, [key]: true }))
    try {
      const { error } = await supabase
        .from('role_permissions')
        .upsert({ role_id: roleId, permission_id: permissionId, granted: !currentGranted }, { onConflict: 'role_id,permission_id' })
      if (error) throw error

      setRolePermMap(prev => {
        const updated = new Set(prev[roleId] || [])
        if (!currentGranted) updated.add(permissionId)
        else updated.delete(permissionId)
        return { ...prev, [roleId]: updated }
      })
    } catch (err) {
      toast.error('Failed to update: ' + err.message)
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  async function handleApprove(req) {
    try {
      await supabase
        .from('role_requests')
        .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', req.id)
      await supabase
        .from('profiles')
        .update({ app_role_id: req.requested_role_id })
        .eq('id', req.user_id)
      toast.success('Request approved')
      setRoleRequests(prev => prev.filter(r => r.id !== req.id))
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDeny(req) {
    try {
      await supabase
        .from('role_requests')
        .update({ status: 'denied', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', req.id)
      toast.success('Request denied')
      setRoleRequests(prev => prev.filter(r => r.id !== req.id))
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Group permissions by feature
  const permsByFeature = permissions.reduce((acc, p) => {
    if (!acc[p.feature]) acc[p.feature] = []
    acc[p.feature].push(p)
    return acc
  }, {})

  const activeRole = roles.find(r => r.id === activeRoleId)
  const isOwnerRole = activeRole?.name === 'owner'

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-noch-green" size={24} />
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="text-noch-green" size={24} />
          <div>
            <h1 className="text-white font-bold text-xl">Role Manager</h1>
            <p className="text-noch-muted text-sm">Control what each role can access</p>
          </div>
        </div>

        {/* Pending Role Requests */}
        {roleRequests.length > 0 && (
          <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl p-4">
            <h2 className="text-yellow-400 font-semibold text-sm mb-3 flex items-center gap-2">
              <AlertCircle size={16} />
              Pending Role Requests ({roleRequests.length})
            </h2>
            <div className="space-y-2">
              {roleRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between gap-3 bg-noch-card rounded-lg p-3">
                  <div>
                    <p className="text-white text-sm font-medium">{req.user?.full_name || req.user?.email}</p>
                    <p className="text-noch-muted text-xs">
                      Requesting role: <span className="text-yellow-400">{req.requested_role?.name}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(req)} className="px-3 py-1.5 text-xs bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg hover:bg-noch-green/20 flex items-center gap-1">
                      <Check size={12} /> Approve
                    </button>
                    <button onClick={() => handleDeny(req)} className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 flex items-center gap-1">
                      <X size={12} /> Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          {/* Role tabs sidebar */}
          <div className="w-44 shrink-0 space-y-1">
            {roles.map(role => (
              <button
                key={role.id}
                onClick={() => setActiveRoleId(role.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between
                  ${activeRoleId === role.id ? 'bg-noch-green/10 text-noch-green border border-noch-green/30' : 'text-noch-muted hover:text-white hover:bg-noch-border border border-transparent'}`}
              >
                <span>{role.name.replace('_', ' ')}</span>
                <ChevronRight size={14} className="opacity-50" />
              </button>
            ))}
          </div>

          {/* Permissions grid */}
          <div className="flex-1 space-y-4">
            {activeRole && (
              <>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${ROLE_COLORS[activeRole.name] || 'text-noch-muted bg-noch-border border-noch-border'}`}>
                    Level {activeRole.level} — {activeRole.name.replace('_', ' ')}
                  </span>
                  {activeRole.description && (
                    <p className="text-noch-muted text-sm">{activeRole.description}</p>
                  )}
                  {isOwnerRole && (
                    <span className="text-xs text-purple-400 ml-auto">
                      Owner always has full access — toggles locked
                    </span>
                  )}
                </div>

                {Object.entries(permsByFeature).map(([feature, perms]) => (
                  <div key={feature} className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-noch-dark border-b border-noch-border">
                      <h3 className="text-noch-muted text-xs font-semibold uppercase tracking-wider">{feature.replace('_', ' ')}</h3>
                    </div>
                    <div className="divide-y divide-noch-border/50">
                      {perms.map(perm => {
                        const granted = rolePermMap[activeRoleId]?.has(perm.id) ?? false
                        const key = `${activeRoleId}-${perm.id}`
                        return (
                          <div key={perm.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-noch-dark/30 transition-colors">
                            <div>
                              <p className="text-white text-sm">{perm.description}</p>
                              <p className="text-noch-muted text-xs font-mono">{feature}.{perm.action}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {saving[key] && <Loader2 size={12} className="animate-spin text-noch-muted" />}
                              <ToggleSwitch
                                checked={isOwnerRole ? true : granted}
                                onChange={() => handleToggle(activeRoleId, perm.id, granted)}
                                disabled={isOwnerRole || saving[key]}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
