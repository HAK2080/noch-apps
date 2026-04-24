-- ============================================================
-- Content Engine V2 — Voice Intelligence + Scouting + Learning
-- ============================================================

-- 1. Voice Fingerprint (scored dimensions)
CREATE TABLE IF NOT EXISTS voice_fingerprint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  dimension text NOT NULL, -- formality, humor, sarcasm, warmth, etc.
  score numeric DEFAULT 5 CHECK (score >= 1 AND score <= 10),
  confidence numeric DEFAULT 5 CHECK (confidence >= 1 AND confidence <= 10),
  evidence text,
  source text DEFAULT 'auto', -- auto | manual_override | human_correction
  source_weight numeric DEFAULT 1, -- human=3, approved=2, auto=1, generated=0.5
  updated_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, dimension)
);

-- 2. Dialect Corpus (Tripoli expressions library)
CREATE TABLE IF NOT EXISTS dialect_corpus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  phrase_ar text NOT NULL,
  phrase_en text,
  context text,
  category text DEFAULT 'slang', -- greeting, complaint, excitement, food, weather, slang, expression
  source text DEFAULT 'manual', -- scraped | manual | training | human_correction
  source_weight numeric DEFAULT 1,
  frequency int DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3. Scout Sources (pages to monitor)
CREATE TABLE IF NOT EXISTS scout_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'facebook', -- facebook | instagram | twitter | web
  page_url text NOT NULL,
  page_name text,
  page_name_ar text,
  category text DEFAULT 'competitor', -- competitor | inspiration | meme | lifestyle | food | dialect
  city text DEFAULT 'tripoli',
  is_active boolean DEFAULT true,
  last_scraped_at timestamptz,
  scrape_count int DEFAULT 0,
  total_posts_collected int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. Generation Log (every generation with config + results)
CREATE TABLE IF NOT EXISTS generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  config_json jsonb NOT NULL DEFAULT '{}',
  research_id uuid,
  swipe_ids uuid[] DEFAULT '{}',
  result_json jsonb,
  score_total numeric,
  score_breakdown jsonb,
  was_approved boolean DEFAULT false,
  was_golden boolean DEFAULT false,
  feedback text, -- human feedback on this generation
  feedback_weight numeric DEFAULT 0, -- 0=none, 3=human rated
  created_at timestamptz DEFAULT now()
);

-- 5. Content Categories (for gap analysis)
CREATE TABLE IF NOT EXISTS content_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  category text NOT NULL,
  subcategory text,
  post_count int DEFAULT 0,
  last_posted_at timestamptz,
  target_frequency text, -- 'daily', '3x/week', 'weekly'
  competitor_frequency text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, category)
);

-- 6. Post Performance (actual metrics after publishing)
CREATE TABLE IF NOT EXISTS post_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES content_posts(id) ON DELETE CASCADE,
  platform text DEFAULT 'instagram',
  reach int DEFAULT 0,
  likes int DEFAULT 0,
  comments int DEFAULT 0,
  shares int DEFAULT 0,
  saves int DEFAULT 0,
  link_clicks int DEFAULT 0,
  engagement_rate numeric DEFAULT 0,
  notes text,
  logged_by text DEFAULT 'manual', -- manual | api
  source_weight numeric DEFAULT 2, -- manual human input = high weight
  logged_at timestamptz DEFAULT now()
);

-- 7. Negative Examples (what NOT to sound like)
CREATE TABLE IF NOT EXISTS negative_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  content text NOT NULL,
  source text, -- where it came from
  platform text,
  why_bad text, -- human explanation of why this is wrong
  tags text[] DEFAULT '{}', -- too_formal, wrong_dialect, bad_humor, etc.
  source_weight numeric DEFAULT 3, -- human-provided = highest weight
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================

-- Brands: add fingerprint + config sweet spot
ALTER TABLE brands ADD COLUMN IF NOT EXISTS voice_fingerprint_json jsonb;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS config_sweet_spot jsonb;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS dialect_density_target int DEFAULT 3;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS extracted_patterns jsonb; -- hook formulas, CTA patterns, templates

-- Swipe File: add engagement + category + source tracking
ALTER TABLE swipe_file ADD COLUMN IF NOT EXISTS engagement_score int DEFAULT 0;
ALTER TABLE swipe_file ADD COLUMN IF NOT EXISTS reactions int DEFAULT 0;
ALTER TABLE swipe_file ADD COLUMN IF NOT EXISTS comments_count int DEFAULT 0;
ALTER TABLE swipe_file ADD COLUMN IF NOT EXISTS shares_count int DEFAULT 0;
ALTER TABLE swipe_file ADD COLUMN IF NOT EXISTS content_category text;
ALTER TABLE swipe_file ADD COLUMN IF NOT EXISTS extracted_patterns text[];
ALTER TABLE swipe_file ADD COLUMN IF NOT EXISTS scraped_from_source uuid;

-- Content Posts: add performance + generation tracking
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS template_used text;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS generation_log_id uuid;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS performance_reach int;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS performance_likes int;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS performance_comments int;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS performance_shares int;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS performance_saves int;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS performance_logged_at timestamptz;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS human_feedback text;
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS human_feedback_weight numeric DEFAULT 0;

-- Brand Materials: add source weight for human vs auto
ALTER TABLE brand_materials ADD COLUMN IF NOT EXISTS source_weight numeric DEFAULT 1;
ALTER TABLE brand_materials ADD COLUMN IF NOT EXISTS is_negative boolean DEFAULT false;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE voice_fingerprint ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialect_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE negative_examples ENABLE ROW LEVEL SECURITY;

-- Authenticated users can CRUD all content engine tables
CREATE POLICY "auth_voice_fingerprint" ON voice_fingerprint FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_dialect_corpus" ON dialect_corpus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_scout_sources" ON scout_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_generation_log" ON generation_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_content_categories" ON content_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_post_performance" ON post_performance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_negative_examples" ON negative_examples FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_voice_fingerprint_brand ON voice_fingerprint(brand_id);
CREATE INDEX IF NOT EXISTS idx_dialect_corpus_brand ON dialect_corpus(brand_id);
CREATE INDEX IF NOT EXISTS idx_dialect_corpus_category ON dialect_corpus(category);
CREATE INDEX IF NOT EXISTS idx_scout_sources_brand ON scout_sources(brand_id);
CREATE INDEX IF NOT EXISTS idx_scout_sources_active ON scout_sources(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_generation_log_brand ON generation_log(brand_id);
CREATE INDEX IF NOT EXISTS idx_generation_log_score ON generation_log(score_total DESC);
CREATE INDEX IF NOT EXISTS idx_post_performance_post ON post_performance(post_id);
CREATE INDEX IF NOT EXISTS idx_negative_examples_brand ON negative_examples(brand_id);
CREATE INDEX IF NOT EXISTS idx_swipe_file_engagement ON swipe_file(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_swipe_file_category ON swipe_file(content_category);
