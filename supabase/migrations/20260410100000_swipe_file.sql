-- Swipe File: collected external posts that match brand voice
CREATE TABLE IF NOT EXISTS swipe_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  source_url text,
  source_platform text,
  caption_text text,
  caption_language text,
  author_handle text,
  hashtags text[],
  why_relevant text,
  voice_similarity_score numeric DEFAULT 0,
  tags text[],
  is_curated boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  collected_by text DEFAULT 'auto',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE swipe_file ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swipe_file_read" ON swipe_file FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "swipe_file_owner_write" ON swipe_file FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

CREATE INDEX IF NOT EXISTS idx_swipe_brand ON swipe_file(brand_id);
CREATE INDEX IF NOT EXISTS idx_swipe_score ON swipe_file(voice_similarity_score DESC);
