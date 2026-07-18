-- Activate Bloom across shared branch-aware modules.
-- The migration is intentionally idempotent so it is safe to apply to an
-- environment where Bloom is already active or its cost center is mapped.

update public.pos_branches
set
  is_active = true,
  operational_status = 'operating'
where name ilike 'Bloom%';

update public.cost_centers cc
set
  pos_branch_id = b.id,
  include_in_split = true
from public.pos_branches b
where cc.id = 'CC03'
  and b.name ilike 'Bloom%';

-- Give Bloom the current active catalog used by the two operating Noch
-- branches. The visibility arrays remain editable afterward for Bloom-only
-- menu changes, while branch ownership and historical data stay unchanged.
update public.pos_products p
set visible_branch_ids = array_append(p.visible_branch_ids, bloom.id)
from public.pos_branches bloom
where bloom.name ilike 'Bloom%'
  and p.is_active = true
  and p.visible_on_menu = true
  and not (bloom.id = any(p.visible_branch_ids))
  and exists (
    select 1
    from public.pos_branches peer
    where (peer.name ilike 'Noch Hay%' or peer.name ilike 'Noch Jaraba')
      and (p.branch_id = peer.id or peer.id = any(p.visible_branch_ids))
  );

update public.pos_categories c
set visible_branch_ids = array_append(c.visible_branch_ids, bloom.id)
from public.pos_branches bloom
where bloom.name ilike 'Bloom%'
  and c.is_active = true
  and not (bloom.id = any(c.visible_branch_ids))
  and exists (
    select 1
    from public.pos_branches peer
    where (peer.name ilike 'Noch Hay%' or peer.name ilike 'Noch Jaraba')
      and (c.branch_id = peer.id or peer.id = any(c.visible_branch_ids))
  );
