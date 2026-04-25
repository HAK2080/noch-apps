-- Draft user ratings: quality score (0–5) and use-likelihood (0–4).
ALTER TABLE cs_draft_variants
  ADD COLUMN user_quality_score smallint CHECK (user_quality_score BETWEEN 0 AND 5),
  ADD COLUMN user_use_likelihood smallint CHECK (user_use_likelihood BETWEEN 0 AND 4);
