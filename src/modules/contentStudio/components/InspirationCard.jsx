import { Link } from 'react-router-dom'
import { Link2, Image as ImageIcon, ClipboardPaste, StickyNote } from 'lucide-react'

const ICONS = {
  url: Link2,
  screenshot: ImageIcon,
  pasted_text: ClipboardPaste,
  note: StickyNote,
}

const STATUS_TONE = {
  new: 'bg-noch-green/10 text-noch-green',
  reviewed: 'bg-amber-500/10 text-amber-400',
  extracted: 'bg-blue-500/10 text-blue-400',
  archived: 'bg-noch-border text-noch-muted',
}

export default function InspirationCard({ item }) {
  const Icon = ICONS[item.source_type] || StickyNote
  const tone = STATUS_TONE[item.status] || STATUS_TONE.new
  const preview = item.preview_image_url
  const blurb = item.source_text || item.source_url || ''

  return (
    <Link
      to={`/content-studio/inspiration/${item.id}`}
      className="block bg-noch-card border border-noch-border rounded-2xl overflow-hidden hover:border-noch-green/40 transition-colors"
    >
      {preview && (
        <div className="aspect-video bg-noch-dark overflow-hidden">
          <img src={preview} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-noch-muted text-xs">
            <Icon size={12} />
            <span className="capitalize">{item.source_type.replace('_', ' ')}</span>
            {item.platform && <span>· {item.platform}</span>}
          </div>
          <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${tone}`}>
            {item.status}
          </span>
        </div>
        <h3 className="text-white font-medium text-sm mb-1 line-clamp-1">
          {item.title || (item.source_url ? new URL(item.source_url).hostname : 'Untitled')}
        </h3>
        {blurb && <p className="text-noch-muted text-xs line-clamp-2">{blurb}</p>}
      </div>
    </Link>
  )
}
