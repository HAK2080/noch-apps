import { useLanguage } from '../../contexts/LanguageContext'

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="card w-full max-w-sm">
        <p className="text-white font-medium mb-6 text-center">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">{t('cancel')}</button>
          <button onClick={onConfirm} className="btn-danger flex-1">{t('deleteTask')}</button>
        </div>
      </div>
    </div>
  )
}
