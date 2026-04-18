create table if not exists content_series (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  name_ar text,
  pillar text not null,
  cadence text, -- daily, weekly, monthly, custom
  cadence_day int, -- 0=Sunday, 1=Monday, etc.
  template_hint text, -- passed to studio as context
  is_active boolean default true,
  post_count int default 0,
  created_at timestamptz default now()
);
alter table content_series enable row level security;
create policy "series_all" on content_series for all to authenticated using (true) with check (true);
