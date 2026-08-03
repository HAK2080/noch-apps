import { useLanguage } from '../../contexts/LanguageContext'

export default function LanguageToggle({ className = '' }) {
  const { lang, toggleLang } = useLanguage()
  return (
    <button
      onClick={toggleLang}
      aria-label={lang === 'ar' ? 'Switch to English' : 'Switch to Arabic'}
      title={lang === 'ar' ? 'English' : 'العربية'}
      className={`text-sm font-semibold text-noch-muted hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-noch-border ${className}`}
    >
      {lang === 'ar' ? 'EN' : 'ع'}
    </button>
  )
}
