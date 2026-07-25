-- Brief-generated drafts may not have a source concept. Keep every draft
-- attached to at least one valid origin: a concept, a brief, or both.

alter table public.cs_draft_variants
  alter column concept_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cs_draft_variants'::regclass
      and conname = 'cs_draft_variants_origin_check'
  ) then
    alter table public.cs_draft_variants
      add constraint cs_draft_variants_origin_check
      check (concept_id is not null or brief_id is not null)
      not valid;
  end if;
end
$$;

alter table public.cs_draft_variants
  validate constraint cs_draft_variants_origin_check;
