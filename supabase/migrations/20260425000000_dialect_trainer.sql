-- Dialect Trainer — stores raw training material and extracted dialect features.
-- Users dump FB screenshots / URLs / pasted text here; the app extracts dialect
-- patterns and merges them into the active voice profile's lexicon / gold examples.

create table if not exists public.cs_dialect_training_items (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid references public.cs_businesses(id) on delete cascade,
  voice_profile_id uuid references public.cs_brand_voice_profiles(id) on delete set null,
  source_type      text not null check (source_type in ('screenshot','url','pasted_text')),
  raw_url          text,
  raw_text         text,
  screenshot_path  text,
  extracted_lexicon    jsonb not null default '[]'::jsonb,
  extracted_gold       jsonb not null default '[]'::jsonb,
  extracted_forbidden  text[]  not null default '{}'::text[],
  extraction_notes     text,
  status           text not null default 'pending'
                   check (status in ('pending','extracted','merged','failed')),
  merged_at        timestamptz,
  created_at       timestamptz default now()
);

alter table public.cs_dialect_training_items enable row level security;

create policy "owner access" on public.cs_dialect_training_items
  using (
    business_id in (
      select id from public.cs_businesses where owner_id = auth.uid()
    )
  );
