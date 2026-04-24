import { Link } from 'react-router-dom'

export default function EmptyState({ icon: Icon, title, description, ctaLabel, ctaTo, onCta }) {
  return (
    <div className="flex flex-col items-center justify-center text-center bg-noch-card border border-dashed border-noch-border rounded-2xl py-16 px-6">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-noch-green/10 text-noch-green flex items-center justify-center mb-4">
          <Icon size={22} />
        </div>
      )}
      <h3 className="text-white font-semibold text-lg mb-1">{title}</h3>
      {description && <p className="text-noch-muted text-sm max-w-md mb-5">{description}</p>}
      {ctaLabel && (ctaTo ? (
        <Link to={ctaTo} className="px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm hover:opacity-90">
          {ctaLabel}
        </Link>
      ) : (
        <button onClick={onCta} className="px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm hover:opacity-90">
          {ctaLabel}
        </button>
      ))}
    </div>
  )
}
