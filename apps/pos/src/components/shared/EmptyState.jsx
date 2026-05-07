export default function EmptyState({ icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-5xl mb-4">{icon}</div>}
      <p className="text-white font-semibold text-lg">{title}</p>
      {hint && <p className="text-noch-muted text-sm mt-1">{hint}</p>}
    </div>
  )
}
