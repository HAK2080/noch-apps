-- ============================================================
-- Content Studio — Inspiration adaptation modes (Phase 1 rebuild)
-- Three modes the owner picks per inspiration:
--   - copy       (Copy / Adapt Fast)
--   - mechanism  (Extract Mechanism)
--   - both       (run both as parallel calls)
-- New fields on cs_extracted_concepts split into two halves —
-- adaptation half (filled by copy mode) and mechanism half
-- (filled by mechanism mode). "Do Both" populates everything.
-- A write-only audit log captures every extraction call.
-- Re-runnable.
-- ============================================================

alter table public.cs_extracted_concepts
  -- which mode produced the latest write to this row
  add column if not exists adaptation_mode text
    check (adaptation_mode in ('copy', 'mechanism', 'both')),

  -- ── Adaptation half (Copy / Adapt Fast) ──
  add column if not exists copy_angle              text,
  add column if not exists noch_adaptation         text,
  add column if not exists localization_angle      text,
  add column if not exists copy_risk_level         text
    check (copy_risk_level in ('low', 'medium', 'high')),
  add column if not exists risk_reason             text,

  -- ── Mechanism half (Extract Mechanism) ──
  add column if not exists mechanism_summary       text,
  add column if not exists visual_pattern          text,
  add column if not exists hook_pattern            text,
  add column if not exists emotional_trigger       text,
  add column if not exists why_it_worked           text,
  add column if not exists suggested_content_mission text,
  add column if not exists suggested_nochi_format    text;

-- Audit log — one row per extraction call. Write-only; the concept
-- row stays the live source of truth, this is for history / undo.
create table if not exists cs_extraction_log (
  id              uuid primary key default gen_random_uuid(),
  inspiration_id  uuid not null references cs_inspirations(id) on delete cascade,
  concept_id      uuid references cs_extracted_concepts(id) on delete set null,
  mode            text not null check (mode in ('copy', 'mechanism', 'both')),
  output          jsonb not null,
  model           text,
  duration_ms     int,
  invoked_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists cs_extraction_log_inspiration_idx
  on cs_extraction_log(inspiration_id, created_at desc);
create index if not exists cs_extraction_log_concept_idx
  on cs_extraction_log(concept_id, created_at desc);

alter table cs_extraction_log enable row level security;
drop policy if exists "cs_extraction_log_owner_all" on cs_extraction_log;
create policy "cs_extraction_log_owner_all" on cs_extraction_log
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'));

notify pgrst, 'reload schema';
