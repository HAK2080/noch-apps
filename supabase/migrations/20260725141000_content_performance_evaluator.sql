-- Unified Content Studio post-performance evaluator.
-- Extends the existing Content Bank performance fields with enough evidence
-- to compare real social results, brand-manifesto fit, and business impact.

alter table public.cs_content_bank_items
  add column if not exists perf_post_url text,
  add column if not exists perf_reach int check (perf_reach >= 0),
  add column if not exists perf_impressions int check (perf_impressions >= 0),
  add column if not exists perf_link_clicks int check (perf_link_clicks >= 0),
  add column if not exists perf_engagement_rate numeric(8,2) check (perf_engagement_rate >= 0),
  add column if not exists perf_effectiveness_score smallint
    check (perf_effectiveness_score between 0 and 100),
  add column if not exists perf_manifesto_score smallint
    check (perf_manifesto_score between 0 and 100),
  add column if not exists perf_ai_evaluation jsonb not null default '{}'::jsonb,
  add column if not exists perf_evaluated_at timestamptz;

create index if not exists cs_content_bank_effectiveness_idx
  on public.cs_content_bank_items(
    business_id,
    perf_effectiveness_score desc nulls last,
    perf_evaluated_at desc nulls last
  );
