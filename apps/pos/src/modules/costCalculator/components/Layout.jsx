import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Zap, LayoutDashboard, FlaskConical, BookOpen, Package, Settings, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/ingredients', icon: FlaskConical, label: 'Ingredients' },
  { to: '/recipes', icon: BookOpen, label: 'Recipes' },
  { to: '/stock', icon: Package, label: 'Stock' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-purple/20 border border-neon-cyan/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-neon-cyan" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-gray-100">CostForge</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Cost Calculator</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User / Sign out */}
      <div className="p-4 border-t border-white/5">
        <div className="text-xs text-gray-500 truncate mb-3 px-2">{user?.email}</div>
        <button
          onClick={handleSignOut}
          className="nav-link w-full text-gray-400 hover:text-neon-red"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 glass-card rounded-none border-t-0 border-b-0 border-l-0 flex-shrink-0">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 glass-card rounded-none border-t-0 border-b-0 border-l-0 z-10">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 p-4 border-b border-white/5">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-gray-200">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-gray-200">CostForge</span>
        </div>

        <div className="p-4 lg:p-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
