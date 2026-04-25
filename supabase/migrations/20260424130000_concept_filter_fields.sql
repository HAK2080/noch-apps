-- Short categorical fields for Concepts filtering.
-- source_brand: the brand/account the inspiration came from (if known)
-- voice_type:   1-3 word label of the voice tone (e.g. "snarky", "warm expert")
-- post_nature:  structural kind ("meme", "text", "reaction", "tutorial", etc.)

alter table public.cs_extracted_concepts
  add column if not exists source_brand text,
  add column if not exists voice_type text,
  add column if not exists post_nature text;
