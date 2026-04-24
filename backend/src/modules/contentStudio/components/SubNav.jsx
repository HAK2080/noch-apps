import { NavLink } from 'react-router-dom'
import { SUB_NAV } from '../lib/constants'

export default function SubNav() {
  return (
    <nav className="flex flex-wrap gap-1 mb-6 p-1 bg-noch-card border border-noch-border rounded-xl">
      {SUB_NAV.map(item => (
        <NavLink
          key={item.to || 'overview'}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${isActive
              ? 'bg-noch-green/10 text-noch-green'
              : 'text-noch-muted hover:text-white hover:bg-noch-border'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
