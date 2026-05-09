-- ============================================================
-- Content Studio rebuild — Phases 2 (briefs) + 3 (signals are
-- read-only — no schema needed) + 5 (voice scoring) + 6
-- (campaigns) + 7 (performance tracking on bank items).
-- Phase 4 (Ideas → Brief bridge) is pure frontend, no schema.
-- Re-runnable.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PHASE 2 — Briefs (strategic layer between concept and draft)
-- ─────────────────────────────────────────────────────────────

create table if not exists cs_briefs (
  id                          uuid primary key default gen_random_uuid(),
  business_id                 uuid references cs_businesses(id) on delete set null,

  -- Identity / objective
  title                       text,
  objective                   text,
  content_mission             text,
  target_audience             text,
  product_focus               text,

  -- Source signal (linkable to upstream artefact OR ad-hoc)
  reference_inspiration_id    uuid references cs_inspirations(id) on delete set null,
  reference_concept_id        uuid references cs_extracted_concepts(id) on delete set null,
  source_signal_type          text check (source_signal_type in (
                                'inspiration', 'concept', 'pos_signal',
                                'loyalty_signal', 'local_idea', 'manual'
                              )),
  customer_signal             text,

  -- Strategic angle
  emotional_angle             text,
  content_pillar              text,
  nochi_format                text,

  -- Channel / language
  platform                    text,
  format                      text,
  language                    text,
  dialect                     text,
  cta_style                   text,

  -- Quality + risk
  quality_score               smallint check (quality_score between 1 and 5),
  copy_risk_level             text check (copy_risk_level in ('low','medium','high')),
  risk_level                  text,

  -- Quality sub-scores (each 1-5; persistable rubric)
  q_objective_clarity         smallint check (q_objective_clarity between 1 and 5),
  q_audience_clarity          smallint check (q_audience_clarity between 1 and 5),
  q_nochi_fit                 smallint check (q_nochi_fit between 1 and 5),
  q_local_relevance           smallint check (q_local_relevance between 1 and 5),
  q_business_value            smallint check (q_business_value between 1 and 5),
  q_execution_simplicity      smallint check (q_execution_simplicity between 1 and 5),

  notes                       text,
  status                      text not null default 'draft'
                                check (status in ('draft','ready','used','archived')),

  created_by                  uuid references profiles(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists cs_briefs_business_idx  on cs_briefs(business_id, status, created_at desc);
create index if not exists cs_briefs_concept_idx   on cs_briefs(reference_concept_id);
create index if not exists cs_briefs_inspiration_idx on cs_briefs(reference_inspiration_id);

alter table cs_briefs enable row level security;
drop policy if exists "cs_briefs_authenticated_all" on cs_briefs;
create policy "cs_briefs_authenticated_all" on cs_briefs
  for all to authenticated using (true) with check (true);

-- Drafts can now optionally point to a brief OR a concept (or both).
alter table cs_draft_variants
  add column if not exists brief_id uuid references cs_briefs(id) on delete set null;

create index if not exists cs_draft_variants_brief_idx on cs_draft_variants(brief_id);

-- ─────────────────────────────────────────────────────────────
-- PHASE 4 — Ideas → Brief bridge: track idea-to-brief conversion
-- ─────────────────────────────────────────────────────────────

alter table ideas
  add column if not exists converted_brief_id uuid references cs_briefs(id) on delete set null;

create index if not exists ideas_converted_brief_idx on ideas(converted_brief_id);

-- ─────────────────────────────────────────────────────────────
-- PHASE 5 — Voice Lab + draft evaluation scoring fields
-- ─────────────────────────────────────────────────────────────

alter table cs_draft_variants
  add column if not exists libyan_naturalness_score      smallint check (libyan_naturalness_score between 1 and 5),
  add column if not exists nochi_voice_fit_score         smallint check (nochi_voice_fit_score between 1 and 5),
  add column if not exists human_score                   smallint check (human_score between 1 and 5),
  add column if not exists sales_pressure_score          smallint check (sales_pressure_score between 1 and 5),
  add column if not exists joke_quality_score            smallint check (joke_quality_score between 1 and 5),
  add column if not exists dialect_risk_score            smallint check (dialect_risk_score between 1 and 5),
  add column if not exists premium_playful_balance_score smallint check (premium_playful_balance_score between 1 and 5),
  add column if not exists evaluator_labels              text[] not null default '{}',
  add column if not exists last_rewrite_action           text;

-- Voice profile gets richer guidance (preferred / banned phrases,
-- sample captions, hybrid-language notes).
alter table cs_brand_voice_profiles
  add column if not exists preferred_phrases       text[] not null default '{}',
  add column if not exists banned_phrases          text[] not null default '{}',
  add column if not exists good_caption_samples    text[] not null default '{}',
  add column if not exists bad_caption_samples     text[] not null default '{}',
  add column if not exists hybrid_language_notes   text;

-- ─────────────────────────────────────────────────────────────
-- PHASE 6 — Campaigns
-- ─────────────────────────────────────────────────────────────

create table if not exists cs_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid references cs_businesses(id) on delete set null,
  name                text not null,
  goal                text,
  content_mission     text,
  audience_segment    text,
  product_focus       text,
  source_signal       text,
  start_date          date,
  end_date            date,
  platforms           text[] not null default '{}',
  content_pillars     text[] not null default '{}',
  status              text not null default 'planning'
                        check (status in ('planning','active','paused','completed','archived')),
  success_metric      text,
  notes               text,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists cs_campaigns_business_idx on cs_campaigns(business_id, status, start_date desc);

alter table cs_campaigns enable row level security;
drop policy if exists "cs_campaigns_authenticated_all" on cs_campaigns;
create policy "cs_campaigns_authenticated_all" on cs_campaigns
  for all to authenticated using (true) with check (true);

-- Briefs can optionally belong to a campaign.
alter table cs_briefs
  add column if not exists campaign_id uuid references cs_campaigns(id) on delete set null;

create index if not exists cs_briefs_campaign_idx on cs_briefs(campaign_id);

-- ─────────────────────────────────────────────────────────────
-- PHASE 7 — Performance tracking on Content Bank items
-- ─────────────────────────────────────────────────────────────

alter table cs_content_bank_items
  add column if not exists posted_at              timestamptz,
  add column if not exists perf_platform          text,
  add column if not exists perf_format            text,
  add column if not exists perf_views             int,
  add column if not exists perf_likes             int,
  add column if not exists perf_comments          int,
  add column if not exists perf_shares            int,
  add column if not exists perf_saves             int,
  add column if not exists perf_profile_visits    int,
  add column if not exists perf_orders_before     int,
  add column if not exists perf_orders_after      int,
  add column if not exists perf_loyalty_visits_after int,
  add column if not exists perf_notes             text,
  add column if not exists perf_worked_because    text,
  add column if not exists perf_did_not_work_because text,
  add column if not exists hook_rating            smallint check (hook_rating between 1 and 5),
  add column if not exists creative_rating        smallint check (creative_rating between 1 and 5),
  add column if not exists business_impact_rating smallint check (business_impact_rating between 1 and 5);

-- Convenience: stamp posted_at when first sent
create index if not exists cs_content_bank_posted_idx
  on cs_content_bank_items(posted_at desc nulls last);

-- ─────────────────────────────────────────────────────────────
-- updated_at triggers — fire on insert/update for cs_briefs,
-- cs_campaigns. (cs_content_bank_items already has one in earlier
-- migrations.)
-- ─────────────────────────────────────────────────────────────

create or replace function _cs_touch_updated_at()
returns trigger language plpgsql as $touch$
begin
  new.updated_at = now();
  return new;
end;
$touch$;

drop trigger if exists cs_briefs_updated_at on cs_briefs;
create trigger cs_briefs_updated_at before update on cs_briefs
  for each row execute function _cs_touch_updated_at();

drop trigger if exists cs_campaigns_updated_at on cs_campaigns;
create trigger cs_campaigns_updated_at before update on cs_campaigns
  for each row execute function _cs_touch_updated_at();

notify pgrst, 'reload schema';
