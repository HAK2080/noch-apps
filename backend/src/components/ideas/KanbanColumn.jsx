// src/components/ideas/KanbanColumn.jsx
import { Plus } from 'lucide-react'
import IdeaCard from './IdeaCard'

const COLUMN_COLORS = {
  raw:         'text-noch-muted border-noch-border',
  exploring:   'text-blue-400 border-blue-400/30',
  in_progress: 'text-yellow-400 border-yellow-400/30',
  shelved:     'text-orange-400 border-orange-400/30',
  done:        'text-noch-green border-noch-green/30',
  discarded:   'text-red-400/60 border-red-400/20',
}

const COLUMN_LABELS = {
  raw:         'Raw',
  exploring:   'Exploring',
  in_progress: 'In Progress',
  shelved:     'Shelved',
  done:        'Done',
  discarded:   'Discarded',
}

export default function KanbanColumn({ status, ideas, isOwner, onAddClick, onCardClick, onConvertToTask }) {
  const colorClass = COLUMN_COLORS[status] || COLUMN_COLORS.raw
  const label = COLUMN_LABELS[status] || status

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0">
      {/* Column header */}
      <div className={`flex items-center justify-between mb-3 pb-2 border-b ${colorClass}`}>
        <span className={`text-xs font-bold uppercase tracking-widest ${colorClass.split(' ')[0]}`}>
          {label}
        </span>
        <span className="text-noch-muted text-xs">{ideas.length}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-[40px]">
        {ideas.map(idea => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            isOwner={isOwner}
            onClick={() => onCardClick(idea)}
            onConvertToTask={onConvertToTask}
          />
        ))}
      </div>

      {/* Add shortcut */}
      <button
        onClick={() => onAddClick(status)}
        className="mt-3 flex items-center gap-1.5 text-xs text-noch-muted hover:text-white
          hover:bg-noch-card rounded-lg px-2 py-2 transition-all w-full"
      >
        <Plus size={12} />
        Add idea
      </button>
    </div>
  )
}
