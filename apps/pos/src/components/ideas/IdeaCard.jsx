// src/components/ideas/IdeaCard.jsx
import { Paperclip, ArrowRight } from 'lucide-react'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function IdeaCard({ idea, isOwner, onClick, onConvertToTask }) {
  const attachmentCount = idea.attachment_count ?? (idea.image_url || idea.link_url ? 1 : 0)

  return (
    <div
      onClick={onClick}
      className="bg-noch-dark border border-noch-border rounded-xl p-3 cursor-pointer
        hover:border-noch-green/40 hover:bg-noch-green/5 transition-all active:scale-98 group"
    >
      {/* Category badge */}
      {idea.category && (
        <span
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mb-2 font-medium"
          style={{ backgroundColor: idea.category.color + '22', color: idea.category.color }}
        >
          {idea.category.icon} {idea.category.name}
        </span>
      )}

      {/* Title */}
      <p className="text-white text-sm font-medium line-clamp-2 leading-snug mb-2">
        {idea.title}
      </p>

      {/* Footer row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Submitter — owner only */}
          {isOwner && idea.submitter && (
            <span className="text-noch-muted text-xs truncate max-w-[80px]">
              {idea.submitter.full_name?.split(' ')[0]}
            </span>
          )}
          {/* Attachment count badge */}
          {attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-noch-muted text-xs">
              <Paperclip size={11} />
              {attachmentCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-noch-muted text-xs">{timeAgo(idea.created_at)}</span>
          {/* Convert to task — owner only, not yet converted */}
          {isOwner && !idea.converted_task_id && (
            <button
              onClick={e => { e.stopPropagation(); onConvertToTask(idea) }}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-xs
                text-noch-green hover:text-white transition-all px-1.5 py-0.5 rounded-lg
                bg-noch-green/10 hover:bg-noch-green/30"
              title="Convert to task"
            >
              <ArrowRight size={11} />
              Task
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
