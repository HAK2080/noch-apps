-- Relax originality_risk from strict low|medium|high enum to free-form flag.
-- Admin can review, ignore, change, or drop — it's informational, not gating.
alter table public.cs_extracted_concepts
  drop constraint if exists cs_extracted_concepts_originality_risk_check;

-- Add an acknowledged flag so admin can mark a concept as reviewed regardless of risk value.
alter table public.cs_extracted_concepts
  add column if not exists originality_risk_acknowledged boolean not null default false;
