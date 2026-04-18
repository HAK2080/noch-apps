create table if not exists content_ideas (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  title text,
  notes text,
  source_url text,
  source_platform text, -- instagram, tiktok, twitter, manual
  content_pillar text,  -- notchis_world, the_drop, craft_moment, real_moment, reactive, joyful_nihilism
  tags text[] default '{}',
  status text default 'raw', -- raw, candidate, in_production, used, archived
  image_url text,       -- uploaded screenshot
  ai_score decimal(3,1), -- 0-10, scored by agent
  ai_notes text,        -- agent's analysis
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table content_ideas enable row level security;
create policy "ideas_all" on content_ideas for all to authenticated using (true) with check (true);
