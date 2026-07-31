import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, Command, LogOut, Plus, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { MORE_NAV_ICON, NAV_ITEMS } from '../lib/features'
import { roleLabel } from '../lib/access-control'
import LanguageToggle from './shared/LanguageToggle'
import ThemeToggle from './shared/ThemeToggle'
import { useOpsSettings } from '../modules/ops/lib/useOps'
import OpsReminderPopup, { OpsPersistentBadge } from '../modules/ops/components/OpsReminderPopup'

function NavItem({ to, icon, label, end }) {
  const NavigationIcon = icon
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors duration-150 text-[13px]
        ${isActive
          ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
          : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.045]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute start-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-noch-green" />}
          <NavigationIcon size={14} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? 'text-noch-green' : 'text-zinc-600 group-hover:text-zinc-400'} />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const ar = lang === 'ar'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const role = profile?.role
  const isOwner = role === 'owner'
  const { canAccess, loading: permsLoading, error: permissionsError, landingRoute } = usePermissions()
  const { moduleEnabled: opsEnabled } = useOpsSettings()

  const itemVisible = (item) => {
    if (item.requiresOpsEnabled && !opsEnabled) return false
    if (item.hideForOwner && isOwner) return false
    if (permsLoading) return false
    return canAccess(item.policy)
  }

  const navLabel = (item) => item.labelKey ? t(item.labelKey) : (ar ? item.labelAr : item.labelEn)

  const navItems = []
  let pendingGroup = null
  for (const item of NAV_ITEMS) {
    if (item.type === 'group') {
      if (item.requiresOpsEnabled && !opsEnabled) { pendingGroup = null; continue }
      pendingGroup = item
      continue
    }
    if (!itemVisible(item)) continue
    if (pendingGroup) {
      navItems.push({ type: 'group', label: ar ? pendingGroup.labelAr : pendingGroup.labelEn })
      pendingGroup = null
    }
    navItems.push({ to: item.to, icon: item.icon, label: navLabel(item), end: item.end })
  }
  const navLinkItems = navItems.filter(item => item.type !== 'group')
  const mobileItems = [...navLinkItems]
    .sort((a, b) => (a.mobilePriority || 99) - (b.mobilePriority || 99))
    .slice(0, 4)

  const initials = profile?.full_name
    ?.split(' ')
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  const pageLabel = navLinkItems.find(item => item.to === location.pathname)?.label || (ar ? 'مساحة العمل' : 'Workspace')
  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <aside className="hidden md:flex md:w-[248px] fixed inset-y-0 start-0 flex-col border-e border-white/[0.07] bg-[#0b0b0d]">
        <div className="px-3 pt-3">
          <button
            onClick={() => navigate(landingRoute)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start transition-colors hover:bg-white/[0.05]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-green-300 to-emerald-600 text-[13px] font-bold text-[#06120a] shadow-[0_0_16px_rgba(74,222,128,0.18)]">n</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold tracking-[-0.01em] text-zinc-100">noch.apps</span>
              <span className="block truncate text-[10px] text-zinc-600">{t('appTagline')}</span>
            </span>
            <ChevronDown size={14} className="text-zinc-600" />
          </button>

          <div className="mt-3 flex gap-1">
            <button onClick={() => setSearchOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.035] px-2.5 py-1.5 text-start text-[12px] text-zinc-500 transition-colors hover:border-white/[0.14] hover:text-zinc-300">
              <Search size={13} />
              <span className="flex-1">{ar ? 'بحث' : 'Search'}</span>
              <span className="flex items-center gap-0.5 text-[10px] text-zinc-700"><Command size={10} /> K</span>
            </button>
            {isOwner && (
              <button onClick={() => navigate('/tasks')} aria-label={ar ? 'إنشاء مهمة' : 'Create task'} className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-noch-green text-[#07120a] transition-all hover:brightness-110">
                <Plus size={15} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        <nav className="mt-3 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {navItems.map((item, index) => item.type === 'group' ? (
            <div key={`g-${index}`} className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-700">{item.label}</div>
          ) : <NavItem key={item.to} {...item} />)}
        </nav>

        <div className="border-t border-white/[0.07] px-3 py-3">
          <div className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-green-400/20 bg-green-400/10 text-[10px] font-semibold text-noch-green">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-zinc-200">{profile?.full_name}</p>
              <p className="truncate text-[10px] text-zinc-600">{roleLabel(profile?.role, lang)}</p>
            </div>
            <OpsPersistentBadge />
          </div>
          <div className="flex items-center justify-between gap-1 px-1">
            <LanguageToggle className="justify-start" />
            <ThemeToggle />
            <button onClick={handleSignOut} aria-label={t('logout')} className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-red-400/10 hover:text-red-300"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-20 md:ms-[248px] md:pb-0">
        <header className="sticky top-0 z-10 hidden h-12 items-center justify-between border-b border-white/[0.07] bg-[#0b0b0d]/90 px-6 backdrop-blur md:flex">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-zinc-600">noch.apps</span>
            <span className="text-zinc-800">/</span>
            <span className="text-zinc-300">{pageLabel}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-600">
            <span className="hidden lg:inline">
              {permissionsError
                ? (ar ? 'تعذر التحقق من الصلاحيات' : 'Access verification failed')
                : (ar ? 'تم التحقق من صلاحيات الحساب' : 'Account access verified')}
            </span>
            <span className={`h-1.5 w-1.5 rounded-full ${permissionsError ? 'bg-red-400' : 'bg-noch-green shadow-[0_0_8px_rgba(74,222,128,0.7)]'}`} />
          </div>
        </header>

        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#0b0b0d]/95 px-4 py-3 backdrop-blur md:hidden">
          <button onClick={() => navigate(landingRoute)} className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-noch-green text-xs font-bold text-[#07120a]">n</span>
            <span className="text-sm font-semibold text-zinc-100">noch.apps</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} aria-label={ar ? 'بحث' : 'Search'} className="rounded-md p-1.5 text-zinc-500"><Search size={17} /></button>
            <OpsPersistentBadge />
            <LanguageToggle />
            <button onClick={handleSignOut} aria-label={t('logout')} className="rounded-md p-1.5 text-zinc-500"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>

      <nav className="fixed bottom-0 start-0 end-0 z-10 flex items-center justify-around border-t border-white/[0.08] bg-[#0b0b0d]/95 px-1 py-2 backdrop-blur md:hidden">
        {mobileItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex min-w-[58px] flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[10px] ${isActive ? 'text-noch-green' : 'text-zinc-600'}`}>
            <item.icon size={17} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className="flex min-w-[58px] flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[10px] text-zinc-600">
          <MORE_NAV_ICON size={17} />
          <span>{ar ? 'المزيد' : 'More'}</span>
        </button>
      </nav>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onClick={() => setSearchOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={ar ? 'بحث في مساحة العمل' : 'Search workspace'} className="w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.12] bg-[#151518] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3">
              <Search size={16} className="text-zinc-500" />
              <span className="text-sm text-zinc-300">{ar ? 'بحث في مساحة العمل' : 'Search workspace'}</span>
              <button onClick={() => setSearchOpen(false)} className="ms-auto text-xs text-zinc-600 hover:text-zinc-300">Esc</button>
            </div>
            <div className="p-2">
              {navLinkItems.map(item => (
                <button key={item.to} onClick={() => { setSearchOpen(false); navigate(item.to) }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100">
                  <item.icon size={15} className="text-zinc-600" />
                  <span>{item.label}</span>
                  <span className="ms-auto text-[10px] text-zinc-700">{item.to}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:hidden" onClick={() => setMoreOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={ar ? 'كل الصفحات' : 'All pages'} className="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl border-t border-white/[0.12] bg-[#151518] p-4" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-100">{ar ? 'كل الصفحات المتاحة' : 'All available pages'}</h2>
              <button onClick={() => setMoreOpen(false)} aria-label={ar ? 'إغلاق' : 'Close'} className="rounded-md p-2 text-zinc-500"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {navLinkItems.map(item => (
                <button key={item.to} onClick={() => { setMoreOpen(false); navigate(item.to) }} className="flex items-center gap-2 rounded-lg border border-white/[0.07] p-3 text-start text-xs text-zinc-300">
                  <item.icon size={16} className="shrink-0 text-zinc-500" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <OpsReminderPopup />
    </div>
  )
}
