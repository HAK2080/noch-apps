-- Friendly branch slugs for short URLs (e.g. /feedback/andalous).
-- Additive: the UUID routes used by QR codes keep working unchanged.

alter table pos_branches add column if not exists slug text;

create unique index if not exists pos_branches_slug_key on pos_branches (lower(slug));

-- Owner-chosen slugs.
update pos_branches set slug = 'andalous' where id = '8936e821-ad7f-4d69-b654-c2f76404f89f';
update pos_branches set slug = 'jaraba'   where id = '1332e9b6-8137-40fb-ad3e-074521c32ffb';
