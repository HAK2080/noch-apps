import { useState, useEffect } from 'react'
import { Send } from 'lucide-react'
import { getComments, createComment } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { sendTelegram } from '../../lib/telegram'
import toast from 'react-hot-toast'

// Simple Telegram plane icon inline so we avoid an extra dependency
function TelegramIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

export default function TaskComments({ taskId, task }) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getComments(taskId).then(setComments).catch(() => {})
  }, [taskId])

  const submit = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    setLoading(true)
    try {
      const c = await createComment(taskId, user.id, body.trim())
      setComments(prev => [...prev, c])
      setBody('')

      // Notify assigned staff via Telegram (non-blocking)
      if (task?.assignee?.telegram_chat_id) {
        const senderName = user.user_metadata?.full_name || 'Someone'
        const message = `💬 *تعليق جديد على مهمة*\n\n` +
          `*${task.title}*\n\n` +
          `${senderName}: ${body.trim()}\n\n` +
          `— فريق بلوم - نوتش ☕`
        // Don't notify if the commenter is the assignee themselves
        if (task.assignee.id !== user.id) {
          sendTelegram(task.assignee.telegram_chat_id, message, taskId).catch(() => {})
        }
      }
    } catch {
      toast.error(t('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h3 className="text-white font-semibold mb-3">{t('addComment')}</h3>

      {comments.length === 0 && (
        <p className="text-noch-muted text-sm mb-4">{t('noComments')}</p>
      )}

      <div className="flex flex-col gap-3 mb-4">
        {comments.map(c => (
          <div key={c.id} className="bg-noch-dark rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-noch-green text-xs font-semibold">
                {c.author?.full_name ?? (c.source === 'telegram' ? 'Telegram' : 'مجهول')}
              </span>
              {c.source === 'telegram' && (
                <span className="flex items-center gap-1 text-[#229ED9] text-xs bg-[#229ED9]/10 px-1.5 py-0.5 rounded-full">
                  <TelegramIcon size={10} />
                  Telegram
                </span>
              )}
              <span className="text-noch-muted text-xs">
                {new Date(c.created_at).toLocaleDateString('ar-LY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-white text-sm whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input flex-1"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={t('commentPlaceholder')}
        />
        <button type="submit" disabled={loading} className="btn-primary px-3">
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
