import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useLanguage } from '../../contexts/LanguageContext'

export default function ThemeToggle({ className = '', compact = false }) {
  const { theme, toggle } = useTheme()
  const { lang } = useLanguage()
  const isDark = theme === 'dark'
  const label = isDark
    ? (lang === 'ar' ? 'التبديل إلى الوضع الفاتح' : 'Switch to bright mode')
    : (lang === 'ar' ? 'التبديل إلى الوضع الداكن' : 'Switch to dark mode')
  const shortLabel = isDark
    ? (lang === 'ar' ? 'فاتح' : 'Bright')
    : (lang === 'ar' ? 'داكن' : 'Dark')

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={isDark}
      className={`theme-toggle flex items-center justify-center gap-2.5 text-sm transition-colors ${compact ? 'theme-toggle-compact' : ''} ${className}`}
      style={{ color: 'var(--staff-muted, var(--muted))' }}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      {!compact && <span>{shortLabel}</span>}
    </button>
  )
}
