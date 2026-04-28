import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, CheckSquare, Users, BarChart2, LogOut, Coffee, Calculator, Sparkles, Package, BarChart3, Heart, ShoppingCart, Lightbulb, Monitor, ShoppingBag, Receipt } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from './shared/LanguageToggle'

function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150 text-sm font-medium relative
        ${isActive
          ? 'text-white'
          : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
              style={{ background: 'linear-gradient(180deg, #4ADE80, #22C55E)' }}
            />
          )}
          <Icon size={16} style={{ color: isActive ? '#4ADE80' : undefined }} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const ownerNav = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('dashboard'), end: true },
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
    { to: '/tasks', icon: CheckSquare, label: t('tasks') },
    { to: '/recipes', icon: Coffee, label: t('recipes') },
    { to: '/cost-calculator', icon: Calculator, label: 'Cost Calculator' },
    { to: '/content-studio', icon: Sparkles, label: 'Content Studio 2.0' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/inventory', icon: Package, label: 'Inventory' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/loyalty', icon: Heart, label: 'Nochi Loyalty' },
    { to: '/pos', icon: ShoppingCart, label: 'POS' },
    { to: '/products', icon: ShoppingBag, label: 'Products' },
    { to: '/vestaboard', icon: Monitor, label: 'Vestaboard' },
    { to: '/staff', icon: Users, label: t('staff') },
    { to: '/report', icon: BarChart2, label: t('report') },
  ]

  const staffNav = [
    { to: '/my-tasks', icon: CheckSquare, label: t('myTasks'), end: true },
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/recipes', icon: Coffee, label: t('recipes') },
    { to: '/inventory', icon: Package, label: 'Inventory' },
    { to: '/loyalty', icon: Heart, label: 'Nochi Loyalty' },
    { to: '/pos', icon: ShoppingCart, label: 'POS' },
    { to: '/vestaboard', icon: Monitor, label: 'Vestaboard' },
    { to: '/my-card', icon: Coffee, label: '🐰 My Card' },
  ]

  const navItems = profile?.role === 'owner' ? ownerNav : staffNav

  const initials = profile?.full_name
    ?.split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Sidebar — desktop */}
      <aside
        className="hidden md:flex flex-col w-56 fixed h-full border-r"
        style={{
          background: 'linear-gradient(180deg, #0F1013 0%, #09090B 100%)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4ADE80, #22C55E)', boxShadow: '0 0 8px rgba(74,222,128,0.5)' }}
            />
            <h1
              className="font-bold text-lg tracking-tight text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em' }}
            >
              noch <span style={{ color: '#4ADE80' }}>omni</span>
            </h1>
          </div>
          <p className="text-xs mt-1 ms-4" style={{ color: 'var(--muted)' }}>
            {t('appTagline')} <span style={{ color: 'rgba(74,222,128,0.4)' }}>v3.4.0</span>
          </p>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px" style={{ background: 'var(--border)' }} />

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 flex-1 px-3 py-3 overflow-y-auto">
          {navItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-4 h-px" style={{ background: 'var(--border)' }} />

        {/* Bottom */}
        <div className="p-4 flex flex-col gap-2">
          {/* User */}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(74,222,128,0.2), rgba(34,197,94,0.1))',
                border: '1px solid rgba(74,222,128,0.2)',
                color: '#4ADE80',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate leading-none">{profile?.full_name}</p>
              <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--muted)' }}>
                {profile?.role === 'owner' ? t('owner') : t('staffMember')}
              </p>
            </div>
          </div>

          <LanguageToggle className="justify-start" />

          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#F87171'
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <LogOut size={15} />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ms-56 pb-20 md:pb-0">
        {/* Mobile header */}
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 z-10"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: '#4ADE80', boxShadow: '0 0 6px rgba(74,222,128,0.6)' }}
            />
            <h1
              className="font-bold text-lg text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em' }}
            >
              noch <span style={{ color: '#4ADE80' }}>omni</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Bottom nav — mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 py-2 z-10 overflow-x-auto border-t"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-medium
              ${isActive ? 'text-noch-green' : 'text-zinc-500'}`
            }
          >
            <item.icon size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
