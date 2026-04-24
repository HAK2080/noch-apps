import { useNavigate } from 'react-router-dom'
import { Calendar, User, Paperclip, Users, Trash2 } from 'lucide-react'
import PriorityBadge from '../shared/PriorityBadge'
import StatusBadge from '../shared/StatusBadge'
import { formatDueDate, isOverdue } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'

export default function TaskCard({ task, onDelete }) {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { isOwner } = useAuth()
  const overdue = isOverdue(task)

  const handleDelete = (e) => {
    e.stopPropagation()
    onDelete?.(task.id)
  }

  return (
    <div
      onClick={() => navigate(`/tasks/${task.id}`)}
      className={`card cursor-pointer hover:border-noch-green/40 transition-all active:scale-[0.99] relative group
        ${overdue ? 'border-red-500/40' : ''}`}
    >
      {/* Delete button — owner only, shows on hover */}
      {isOwner && onDelete && (
        <button
          onClick={handleDelete}
          className="absolute top-3 end-3 opacity-0 group-hover:opacity-100 transition-opacity text-noch-muted hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 z-10"
          title={t('delete')}
        >
          <Trash2 size={13} />
        </button>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <PriorityBadge priority={task.priority} />
            {task.is_group && (
              <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                <Users size={10} /> مجموعة
              </span>
            )}
          </div>
          <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2">
            {task.title}
          </h3>
        </div>
        <StatusBadge status={task.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-noch-muted">
        {task.assignee && (
          <span className="flex items-center gap-1">
            <User size={12} />
            {task.assignee.full_name}
          </span>
        )}
        <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : ''}`}>
          <Calendar size={12} />
          {formatDueDate(task.due_date, t)}
        </span>
        {task.has_attachments && (
          <span className="flex items-center gap-1">
            <Paperclip size={12} />
          </span>
        )}
      </div>
    </div>
  )
}
