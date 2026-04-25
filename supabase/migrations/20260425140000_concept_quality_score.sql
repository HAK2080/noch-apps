-- Concept quality score: auto-calculated richness indicator (1–5), manually overridable.
ALTER TABLE cs_extracted_concepts
  ADD COLUMN quality_score smallint CHECK (quality_score BETWEEN 1 AND 5),
  ADD COLUMN quality_score_override boolean NOT NULL DEFAULT false;
