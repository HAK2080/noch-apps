import { Fragment, useEffect, useState } from 'react'
import { Bell, Check, Loader2, Pencil, Shield, UserCheck, UserX, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Layout from '../../components/Layout'
import { useLanguage } from '../../contexts/LanguageContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { FEATURE_GROUPS } from '../../lib/features'
import {
  approveRoleChange,
  denyRoleChange,
  getAccountAccessSummary,
  getRolePermissions,
  setProfileAccess,
  updateRolePermission,
} from '../../lib/profiles'
import { ROLE_LABELS, SUPPORTED_ROLES, roleLabel } from '../../lib/access-control'
import { supabase } from '../../lib/supabase'

const ROLE_COLORS = {
  supervisor: 'text-blue-400',
  accountant: 'text-green-400',
  staff: 'text-noch-green',
  limited_staff: 'text-noch-muted',
}

export default function RoleManager() {
  const { lang } = useLanguage()
  const { reloadPermissions } = usePermissions()
  const ar = lang === 'ar'
  const copy = (en, arText) => ar ? arText : en
  const [perms, setPerms] = useState({})
  const [saving, setSaving] = useState({})
  const [requests, setRequests] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [permsData, requestResult, accountData] = await Promise.all([
        getRolePermissions(),
        supabase
          .from('profiles')
          .select('id, full_name, role, role_requested')
          .not('role_requested', 'is', null)
          .neq('role_requested', ''),
        getAccountAccessSummary(),
      ])
      if (requestResult.error) throw requestResult.error

      const map = Object.fromEntries(SUPPORTED_ROLES.map(role => [role, {}]))
      permsData.forEach(grant => {
        if (!map[grant.role]) return
        map[grant.role][grant.feature] = {
          can_access: !!grant.can_access,
          can_edit: !!grant.can_access && !!grant.can_edit,
        }
      })
      setPerms(map)
      setRequests(requestResult.data || [])
      setAccounts(accountData)
    } catch (error) {
      toast.error(error.message || copy('Failed to load access controls', 'تعذر تحميل إعدادات الوصول'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAccess = async (role, feature) => {
    const key = `${role}:${feature}`
    const current = perms[role]?.[feature] || { can_access: false, can_edit: false }
    const next = !current.can_access
      ? { can_access: true, can_edit: false }
      : !current.can_edit
        ? { can_access: true, can_edit: true }
        : { can_access: false, can_edit: false }

    setPerms(previous => ({
      ...previous,
      [role]: { ...previous[role], [feature]: next },
    }))
    setSaving(previous => ({ ...previous, [key]: true }))
    try {
      await updateRolePermission(role, feature, next.can_access, next.can_edit)
      await reloadPermissions()
    } catch (error) {
      setPerms(previous => ({
        ...previous,
        [role]: { ...previous[role], [feature]: current },
      }))
      toast.error(error.message || copy('Save failed', 'فشل الحفظ'))
    } finally {
      setSaving(previous => ({ ...previous, [key]: false }))
    }
  }

  const handleApprove = async staff => {
    if (!SUPPORTED_ROLES.includes(staff.role_requested)) {
      toast.error(copy('This legacy role is archived and cannot be assigned.', 'هذا الدور القديم مؤرشف ولا يمكن تعيينه.'))
      return
    }
    try {
      await approveRoleChange(staff.id, staff.role_requested)
      setRequests(previous => previous.filter(request => request.id !== staff.id))
      toast.success(copy('Role request approved', 'تم اعتماد طلب الدور'))
    } catch (error) {
      toast.error(error.message || copy('Approval failed', 'فشل الاعتماد'))
    }
  }

  const handleDeny = async staff => {
    try {
      await denyRoleChange(staff.id)
      setRequests(previous => previous.filter(request => request.id !== staff.id))
      toast.success(copy('Role request denied', 'تم رفض طلب الدور'))
    } catch (error) {
      toast.error(error.message || copy('Request failed', 'فشل الطلب'))
    }
  }

  const handleAccountAccess = async account => {
    const nextEnabled = !account.access_enabled
    const key = `account:${account.profile_id}`
    setSaving(previous => ({ ...previous, [key]: true }))
    try {
      await setProfileAccess(
        account.profile_id,
        nextEnabled,
        nextEnabled ? 'Enabled in Role Manager' : 'Disabled in Role Manager',
      )
      setAccounts(previous => previous.map(item => item.profile_id === account.profile_id
        ? { ...item, access_enabled: nextEnabled }
        : item))
      toast.success(nextEnabled
        ? copy('Account access enabled', 'تم تفعيل دخول الحساب')
        : copy('Account access disabled', 'تم إيقاف دخول الحساب'))
    } catch (error) {
      toast.error(error.message || copy('Access update failed', 'فشل تحديث الوصول'))
    } finally {
      setSaving(previous => ({ ...previous, [key]: false }))
    }
  }

  if (loading) return <Layout><p className="py-16 text-center text-noch-muted">{copy('Loading access controls…', 'جارٍ تحميل إعدادات الوصول…')}</p></Layout>

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-noch-green" />
          <div>
            <h1 className="text-xl font-bold text-white">{copy('Roles and access', 'الأدوار والوصول')}</h1>
            <p className="text-xs text-noch-muted">{copy('Account access, module access, and edit authority are separate controls.', 'دخول الحساب والوصول للوحدات وصلاحية التعديل هي ضوابط منفصلة.')}</p>
          </div>
        </div>

        <section className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">{copy('Account access', 'دخول الحسابات')}</h2>
              <p className="text-xs text-noch-muted">{copy('Disabling login never deletes staff or payroll records.', 'إيقاف الدخول لا يحذف بيانات الموظف أو الرواتب.')}</p>
            </div>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-noch-muted">
              {accounts.filter(account => account.access_enabled).length}/{accounts.length} {copy('enabled', 'مفعّل')}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {accounts.map(account => {
              const key = `account:${account.profile_id}`
              const locked = account.role === 'owner' || !account.auth_linked
              return (
                <div key={account.profile_id} className="flex items-center gap-3 rounded-xl border border-noch-border bg-noch-dark p-3">
                  {account.access_enabled ? <UserCheck size={17} className="text-noch-green" /> : <UserX size={17} className="text-red-400" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{account.full_name}</p>
                    <p className="text-xs text-noch-muted">
                      {roleLabel(account.role, lang)} · {account.auth_linked ? copy('login linked', 'مرتبط بتسجيل دخول') : copy('no login linked', 'غير مرتبط بتسجيل دخول')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={locked || saving[key]}
                    onClick={() => handleAccountAccess(account)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${account.access_enabled ? 'border-red-400/30 text-red-300' : 'border-green-400/30 text-noch-green'}`}
                  >
                    {saving[key] ? <Loader2 size={13} className="animate-spin" /> : account.access_enabled ? copy('Disable', 'إيقاف') : copy('Enable', 'تفعيل')}
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {requests.length > 0 && (
          <section className="card border-yellow-500/20">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Bell size={14} className="text-yellow-400" />
              {copy('Pending role requests', 'طلبات الأدوار المعلقة')} ({requests.length})
            </h2>
            <div className="flex flex-col gap-2">
              {requests.map(staff => (
                <div key={staff.id} className="flex items-center justify-between gap-3 rounded-xl border border-noch-border bg-noch-dark p-3">
                  <div>
                    <p className="text-sm font-medium text-white">{staff.full_name}</p>
                    <p className="text-xs text-noch-muted">
                      {roleLabel(staff.role, lang)} → {roleLabel(staff.role_requested, lang)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => handleApprove(staff)} aria-label={copy('Approve', 'اعتماد')} className="rounded-lg bg-noch-green/10 p-2 text-noch-green"><Check size={14} /></button>
                    <button onClick={() => handleDeny(staff)} aria-label={copy('Deny', 'رفض')} className="rounded-lg bg-red-500/10 p-2 text-red-400"><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card overflow-x-auto">
          <h2 className="font-semibold text-white">{copy('Module permissions', 'صلاحيات الوحدات')}</h2>
          <p className="mb-4 mt-1 text-xs text-noch-muted">
            {copy('Click: off → view → view and edit → off. Owner access is always on.', 'انقر للتبديل: متوقف ← عرض ← عرض وتعديل ← متوقف. وصول المالك دائمًا مفعّل.')}
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-48 px-3 py-2 text-start text-xs font-medium text-noch-muted">{copy('Module', 'الوحدة')}</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-purple-400">{ROLE_LABELS.owner[lang]}</th>
                {SUPPORTED_ROLES.map(role => (
                  <th key={role} className={`px-3 py-2 text-center text-xs font-semibold ${ROLE_COLORS[role]}`}>{roleLabel(role, lang)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map(group => (
                <Fragment key={group.labelEn}>
                  <tr>
                    <td colSpan={SUPPORTED_ROLES.length + 2} className="px-3 pb-1 pt-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-noch-muted/70">{ar ? group.labelAr : group.labelEn}</span>
                    </td>
                  </tr>
                  {group.features.map(feature => (
                    <tr key={feature.key} className="border-t border-noch-border/30 hover:bg-noch-dark/50">
                      <td className="px-3 py-2 text-xs text-white">{ar ? feature.labelAr : feature.labelEn}</td>
                      <td className="px-3 py-2 text-center"><Check size={13} className="mx-auto text-purple-400" /></td>
                      {SUPPORTED_ROLES.map(role => {
                        const key = `${role}:${feature.key}`
                        const grant = perms[role]?.[feature.key] || { can_access: false, can_edit: false }
                        return (
                          <td key={role} className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggleAccess(role, feature.key)}
                              disabled={saving[key]}
                              aria-label={`${roleLabel(role, lang)}: ${ar ? feature.labelAr : feature.labelEn}`}
                              className={`mx-auto flex h-7 w-7 items-center justify-center rounded border ${grant.can_edit ? 'border-blue-400/50 bg-blue-400/20 text-blue-400' : grant.can_access ? 'border-noch-green/50 bg-noch-green/20 text-noch-green' : 'border-noch-border text-noch-muted'}`}
                            >
                              {saving[key] ? <Loader2 size={11} className="animate-spin" /> : grant.can_edit ? <Pencil size={11} /> : grant.can_access ? <Check size={11} /> : <span className="h-1 w-1 rounded-full bg-noch-border" />}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-noch-muted">
            {copy('The old data-entry role is archived. Its historical rows are preserved but it cannot be assigned.', 'دور إدخال البيانات القديم مؤرشف. تم حفظ سجلاته التاريخية ولا يمكن تعيينه.')}
          </p>
        </section>
      </div>
    </Layout>
  )
}
