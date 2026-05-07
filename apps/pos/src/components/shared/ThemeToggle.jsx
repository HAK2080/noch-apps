import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150 hover:bg-white/[0.04] ${className}`}
      style={{ color: 'var(--muted)' }}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}
