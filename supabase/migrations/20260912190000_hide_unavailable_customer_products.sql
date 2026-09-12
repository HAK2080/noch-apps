begin;

-- Customer surfaces receive only a yes/no answer. No stock quantities, costs,
-- locations, or internal block reasons are exposed.
create or replace function public.get_customer_sale_availability(p_branch uuid default null)
returns table(product_id uuid,available boolean)
language sql stable security definer set search_path=public as $$
  with eligible_branches as (
    select b.id
    from public.pos_branches b
    where case when p_branch is not null then b.id=p_branch and b.is_active
      else b.is_active and b.operational_status='operating' end
  ), availability as (
    select a.product_id,a.blocked
    from eligible_branches b
    cross join lateral public.get_sale_availability(b.id) a
  )
  select product_id,bool_or(not blocked) available
  from availability
  group by product_id
$$;

revoke all on function public.get_customer_sale_availability(uuid) from public;
grant execute on function public.get_customer_sale_availability(uuid) to anon,authenticated;

comment on function public.get_customer_sale_availability(uuid) is
  'Public menu saleability. A branch menu requires stock at that branch; the general menu requires stock at any operational branch.';

commit;
