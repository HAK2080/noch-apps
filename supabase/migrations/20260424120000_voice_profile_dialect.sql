-- Add dialect-training layers to brand voice profiles.
-- Supports structured lexicon, gold examples, explicit forbidden MSA forms,
-- prose rules, and a last-tuned timestamp for the dialect-refresh cron.

alter table public.cs_brand_voice_profiles
  add column if not exists dialect_rules text,
  add column if not exists dialect_lexicon jsonb not null default '[]'::jsonb,
  add column if not exists gold_examples jsonb not null default '[]'::jsonb,
  add column if not exists forbidden_msa_forms text[] not null default '{}'::text[],
  add column if not exists dialect_last_tuned_at timestamptz;
