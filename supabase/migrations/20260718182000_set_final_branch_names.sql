-- Final canonical branch labels requested by the owner.
-- Keep branch IDs, operational statuses, and all historical relationships.

update public.pos_branches
set
  name = 'Noch - City Walk',
  name_ar = 'نوتش - سيتي ووك',
  receipt_header = 'NOCH - CITY WALK'
where id = '8936e821-ad7f-4d69-b654-c2f76404f89f';

update public.pos_branches
set
  name = 'Noch - Gallery Mall',
  name_ar = 'نوتش - جاليري مول',
  receipt_header = 'NOCH - GALLERY MALL'
where id = '1332e9b6-8137-40fb-ad3e-074521c32ffb';

update public.pos_branches
set
  name = 'Bloom',
  name_ar = 'بلوم',
  receipt_header = 'BLOOM'
where id = '8459848d-fe99-4716-8222-c99b8746d881';

update public.cost_centers
set name = 'Noch - City Walk'
where id = 'CC01';

update public.cost_centers
set name = 'Noch - Gallery Mall'
where id = 'CC02';

update public.cost_centers
set name = 'Bloom'
where id = 'CC03';
