import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, CheckSquare, Users, BarChart2, LogOut, Coffee, Calculator, Sparkles, Package, BarChart3, Heart, ShoppingCart, Lightbulb, Monitor, Shield, Receipt } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermission } from '../lib/usePermission'
import { usePermissions } from '../contexts/PermissionsContext'
import LanguageToggle from './shared/LanguageToggle'

function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium text-sm
        ${isActive
          ? 'bg-noch-green/10 text-noch-green'
          : 'text-noch-muted hover:text-white hover:bg-noch-border'
        }`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const can = usePermission()
  const { hasAccess } = usePermissions()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const ownerNav = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('dashboard'), end: true },
    { to: '/tasks', icon: CheckSquare, label: t('tasks') },
    { to: '/recipes', icon: Coffee, label: t('recipes') },
    { to: '/cost-calculator', icon: Calculator, label: 'Cost Calculator' },
    { to: '/content', icon: Sparkles, label: 'Content Studio', feature: 'content' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas', feature: 'ideas' },
    { to: '/inventory', icon: Package, label: 'Inventory', feature: 'inventory' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics', feature: 'analytics' },
    { to: '/loyalty', icon: Heart, label: 'Nochi Loyalty', feature: 'loyalty' },
    { to: '/pos', icon: ShoppingCart, label: 'POS', feature: 'pos' },
    { to: '/sales', icon: Receipt, label: 'Sales', feature: 'sales' },
    { to: '/vestaboard', icon: Monitor, label: 'Vestaboard' },
    { to: '/staff', icon: Users, label: t('staff'), feature: 'staff' },
    { to: '/staff/roles', icon: Shield, label: 'Roles & Permissions', perm: ['role_management', 'manage'] },
    { to: '/report', icon: BarChart2, label: t('report') },
  ]

  const staffNav = [
    { to: '/my-tasks', icon: CheckSquare, label: t('myTasks'), end: true },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas', feature: 'ideas' },
    { to: '/recipes', icon: Coffee, label: t('recipes'), feature: 'recipes' },
    { to: '/inventory', icon: Package, label: 'Inventory', feature: 'inventory' },
    { to: '/loyalty', icon: Heart, label: 'Nochi Loyalty', feature: 'loyalty' },
    { to: '/pos', icon: ShoppingCart, label: 'POS', feature: 'pos' },
    { to: '/sales', icon: Receipt, label: 'Sales', feature: 'sales' },
    { to: '/vestaboard', icon: Monitor, label: 'Vestaboard' },
    { to: '/my-card', icon: Coffee, label: '🐰 My Card' },
  ]

  const allNav = profile?.role === 'owner' ? ownerNav : staffNav
  // Filter items that require specific permissions (both old UUID system and new TEXT system)
  const navItems = allNav.filter(item => {
    if (item.perm && !can(item.perm[0], item.perm[1])) return false
    if (item.feature && !hasAccess(item.feature)) return false
    return true
  })

  return (
    <div className="flex min-h-screen bg-noch-dark">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 border-e border-noch-border bg-noch-card p-4 fixed h-full">
        {/* Logo */}
        <div className="mb-8 px-1">
          <h1 className="text-noch-green font-bold text-2xl tracking-tight">noch omni</h1>
          <p className="text-noch-muted text-xs">{t('appTagline')} <span className="text-noch-green/50">v3.2.0</span></p>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* Bottom */}
        <div className="flex flex-col gap-2 mt-4 border-t border-noch-border pt-4">
          <div className="px-3 py-2">
            <p className="text-white text-sm font-medium truncate">{profile?.full_name}</p>
            <p className="text-noch-muted text-xs capitalize">{profile?.role === 'owner' ? t('owner') : t('staffMember')}</p>
          </div>
          <LanguageToggle className="justify-start" />
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-noch-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
          >
            <LogOut size={16} />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ms-56 pb-20 md:pb-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-noch-border bg-noch-card sticky top-0 z-10">
          <h1 className="text-noch-green font-bold text-xl">noch omni</h1>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button onClick={handleSignOut} className="text-noch-muted p-1">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-noch-card border-t border-noch-border flex items-center justify-around px-2 py-2 z-10 overflow-x-auto">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors whitespace-nowrap
              ${isActive ? 'text-noch-green' : 'text-noch-muted'}`
            }
          >
            <item.icon size={20} />
            <span className="text-xs">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
