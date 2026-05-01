import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'

export default function BackButton({ to, label, className = '' }) {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const isRtl = lang === 'ar'
  const Icon = isRtl ? ArrowRight : ArrowLeft
  const text = label || (isRtl ? 'رجوع' : 'Back')
  return (
    <button
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className={`flex items-center gap-1.5 text-sm text-noch-muted hover:text-white transition-colors mb-4 ${className}`}
    >
      <Icon size={15} />
      <span>{text}</span>
    </button>
  )
}
