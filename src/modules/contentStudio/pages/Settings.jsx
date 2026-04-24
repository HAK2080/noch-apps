import { Settings as SettingsIcon, Database, Wand2, Shield } from 'lucide-react'

const PIPELINE = [
  { label: 'Concept extraction', fn: 'cs-extract-concept', model: 'claude-sonnet-4' },
  { label: 'Draft generation',   fn: 'cs-generate-drafts', model: 'claude-opus-4' },
  { label: 'Draft evaluation',   fn: 'cs-evaluate-draft',  model: 'claude-sonnet-4 + heuristics' },
  { label: 'Humanize / rewrite', fn: 'cs-humanize-draft',  model: 'claude-sonnet-4' },
]

const TABLES = [
  'cs_businesses',
  'cs_brand_voice_profiles',
  'cs_inspirations',
  'cs_extracted_concepts',
  'cs_draft_variants',
  'cs_draft_evaluations',
  'cs_user_edits',
  'cs_learning_signals',
  'cs_content_bank_items',
  'cs_creative_briefs',
]

export default function Settings() {
  return (
    <div className="space-y-4">
      <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
        <header className="flex items-center gap-2 mb-3">
          <SettingsIcon size={16} className="text-noch-green" />
          <h2 className="text-white font-semibold">Module</h2>
        </header>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-noch-muted">App version</dt><dd className="text-white">Noch 4.0.0</dd>
          <dt className="text-noch-muted">Module path</dt><dd className="text-white font-mono text-xs">src/modules/contentStudio</dd>
          <dt className="text-noch-muted">Storage bucket</dt><dd className="text-white font-mono text-xs">content-studio-inspirations</dd>
          <dt className="text-noch-muted">Evaluator version</dt><dd className="text-white font-mono text-xs">v1</dd>
        </dl>
      </section>

      <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
        <header className="flex items-center gap-2 mb-3">
          <Wand2 size={16} className="text-noch-green" />
          <h2 className="text-white font-semibold">AI pipeline</h2>
        </header>
        <ul className="space-y-2 text-sm">
          {PIPELINE.map(p => (
            <li key={p.fn} className="flex items-center justify-between border-b border-noch-border/50 pb-1.5 last:border-0">
              <span className="text-white">{p.label}</span>
              <span className="text-noch-muted text-xs font-mono">{p.fn} · {p.model}</span>
            </li>
          ))}
        </ul>
        <p className="text-noch-muted text-xs mt-3">
          Each step is a separate edge function with structured JSON output. Generation and evaluation
          are decoupled — an evaluation never determines a draft, only labels it. Every rewrite
          produces a new draft row with <code className="font-mono text-noch-green">parent_draft_id</code> pointing to the previous version.
        </p>
      </section>

      <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
        <header className="flex items-center gap-2 mb-3">
          <Database size={16} className="text-noch-green" />
          <h2 className="text-white font-semibold">Data model</h2>
        </header>
        <div className="grid grid-cols-2 gap-1.5 text-xs font-mono text-noch-muted">
          {TABLES.map(t => <span key={t}>{t}</span>)}
        </div>
      </section>

      <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
        <header className="flex items-center gap-2 mb-3">
          <Shield size={16} className="text-noch-green" />
          <h2 className="text-white font-semibold">Access</h2>
        </header>
        <p className="text-noch-muted text-sm">
          Content Studio is owner-only. RLS grants read to all authenticated users and write only to
          profiles with <code className="font-mono text-noch-green">role = 'owner'</code>.
        </p>
      </section>
    </div>
  )
}
