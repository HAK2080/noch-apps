-- Keep cost-center labels identical to the branch labels used by POS and
-- Finance. The IDs and branch mappings remain unchanged.

update public.cost_centers
set name = 'Noch Hay Al-Andalus'
where id = 'CC01';

update public.cost_centers
set name = 'Noch Gallery Mall'
where id = 'CC02';

update public.cost_centers
set name = 'Bloom Abu Nawas'
where id = 'CC03';
