-- Content Studio migration
-- Brands table (multi-brand SaaS foundation)
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  tagline text,
  tagline_ar text,
  category text DEFAULT 'cafe',
  voice_archetype text,
  voice_inspirations text[],
  personality_notes text,
  target_audience text,
  dialect text DEFAULT 'libyan-tripoli',
  platforms text[] DEFAULT ARRAY['instagram','facebook'],
  primary_color text DEFAULT '#4ADE80',
  logo_url text,
  brand_program text,
  voice_score numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Brand training materials
CREATE TABLE IF NOT EXISTS brand_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text,
  content text,
  url text,
  file_url text,
  notes text,
  tags text[],
  created_at timestamptz DEFAULT now()
);

-- Content research / scouted ideas
CREATE TABLE IF NOT EXISTS content_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_url text,
  source_title text,
  source_platform text,
  raw_content text,
  image_url text,
  insight text,
  tags text[],
  relevance_score numeric DEFAULT 0,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

-- Content posts (generated proposals)
CREATE TABLE IF NOT EXISTS content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  research_id uuid REFERENCES content_research(id) ON DELETE SET NULL,
  format text NOT NULL,
  platform text NOT NULL DEFAULT 'instagram',
  caption_en text,
  caption_ar text,
  caption_final text,
  image_brief text,
  image_url text,
  video_brief text,
  hashtags text[],
  cta text,
  source_url text,
  source_caption text,
  status text DEFAULT 'draft',
  generation_prompt text,
  generation_model text DEFAULT 'claude',
  score_voice numeric,
  score_dialect numeric,
  score_hook numeric,
  score_humor numeric,
  score_relevance numeric,
  score_total numeric,
  rejection_reason text,
  revision_notes text,
  dialect_corrections jsonb,
  scheduled_at timestamptz,
  published_at timestamptz,
  published_url text,
  iteration_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Self-improvement log (Karpathy results_log pattern)
CREATE TABLE IF NOT EXISTS content_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  experiment_type text,
  hypothesis text,
  content_post_id uuid REFERENCES content_posts(id) ON DELETE SET NULL,
  score_before numeric,
  score_after numeric,
  delta numeric,
  lesson_learned text,
  applied_to_program boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Content calendar
CREATE TABLE IF NOT EXISTS content_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  post_id uuid REFERENCES content_posts(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  platform text NOT NULL,
  status text DEFAULT 'queued',
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

-- Read policies (all authenticated)
CREATE POLICY "brands_read" ON brands FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "brand_materials_read" ON brand_materials FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "content_research_read" ON content_research FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "content_posts_read" ON content_posts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "content_experiments_read" ON content_experiments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "content_calendar_read" ON content_calendar FOR SELECT USING (auth.role() = 'authenticated');

-- Write policies (owners only)
CREATE POLICY "brands_owner_write" ON brands FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
CREATE POLICY "brand_materials_owner_write" ON brand_materials FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
CREATE POLICY "content_research_owner_write" ON content_research FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
CREATE POLICY "content_posts_owner_write" ON content_posts FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
CREATE POLICY "content_experiments_owner_write" ON content_experiments FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
CREATE POLICY "content_calendar_owner_write" ON content_calendar FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));
