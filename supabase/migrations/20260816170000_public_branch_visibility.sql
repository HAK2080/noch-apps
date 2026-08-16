-- Owner-managed customer visibility for branch selectors.
-- `operating` is selectable, `pre_opening` is shown as Coming Soon, and
-- `closed` is omitted. POS availability remains aligned with that status.

update public.pos_branches
set operational_status = 'closed'
where is_active is false
  and operational_status = 'operating';

update public.pos_branches
set is_active = false
where operational_status in ('pre_opening', 'closed')
  and is_active is distinct from false;

create or replace function public.get_public_branch_listings()
returns table (
  id uuid,
  name text,
  name_ar text,
  location text,
  operational_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    branch.id,
    branch.name,
    branch.name_ar,
    branch.location,
    branch.operational_status
  from public.pos_branches branch
  where (branch.operational_status = 'operating' and branch.is_active is true)
     or branch.operational_status = 'pre_opening'
  order by
    case branch.operational_status when 'operating' then 0 else 1 end,
    branch.name;
$$;

revoke all on function public.get_public_branch_listings() from public;
grant execute on function public.get_public_branch_listings() to anon, authenticated;

comment on function public.get_public_branch_listings() is
  'Returns only safe display fields for operational and coming-soon customer branch listings.';
