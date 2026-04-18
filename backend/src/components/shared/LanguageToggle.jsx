import { useLanguage } from '../../contexts/LanguageContext'

export default function LanguageToggle({ className = '' }) {
  const { lang, toggleLang } = useLanguage()
  return (
    <button
      onClick={toggleLang}
      className={`text-sm font-semibold text-noch-muted hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-noch-border ${className}`}
    >
      {lang === 'ar' ? 'EN' : 'ع'}
    </button>
  )
}
