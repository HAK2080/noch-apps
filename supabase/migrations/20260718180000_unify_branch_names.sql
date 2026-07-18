-- Canonical branch display names. IDs stay unchanged so historical data,
-- permissions, costs, orders, and QR links remain attached to each branch.

update public.pos_branches
set
  name = 'Noch Hay Al-Andalus',
  name_ar = 'نوتش حي الأندلس',
  location = 'حي الأندلس، طرابلس',
  receipt_header = 'NOCH CAFÉ - حي الأندلس'
where id = '8936e821-ad7f-4d69-b654-c2f76404f89f';

update public.pos_branches
set
  name = 'Noch Gallery Mall',
  name_ar = 'نوتش جاليري مول',
  location = 'جاليري مول، طرابلس',
  receipt_header = 'NOCH CAFÉ - جاليري مول'
where id = '1332e9b6-8137-40fb-ad3e-074521c32ffb';

update public.pos_branches
set
  name = 'Bloom Abu Nawas',
  name_ar = 'بلوم أبو نواس',
  location = 'أبو نواس، طرابلس',
  receipt_header = 'BLOOM COFFEE - أبو نواس'
where id = '8459848d-fe99-4716-8222-c99b8746d881';
