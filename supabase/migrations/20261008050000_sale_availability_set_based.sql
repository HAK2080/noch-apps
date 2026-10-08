-- Keep the exact stock policy and public response, while evaluating stock
-- requirements as a set instead of rebuilding JSON/re-reading each product.
create or replace function public.get_sale_availability(p_branch uuid)
returns table(product_id uuid, blocked boolean, reason text)
language plpgsql stable security definer set search_path=public
as $function$
begin
  -- With strict stock control off, only the manual sold-out flag matters.
  if not public.strict_stock_enabled() then
    return query
      select p.id, coalesce(p.is_sold_out,false),
        case when p.is_sold_out then 'Sold out'::text else null::text end
      from public.pos_products p
      where p.is_active and (p_branch is null or p.branch_id=p_branch
        or p.branch_id is null or p_branch=any(p.visible_branch_ids));
    return;
  end if;

  return query
    with location as materialized (
      select l.id from public.inventory_locations l
      where l.branch_id=p_branch and l.location_type='branch' and l.is_active
      order by l.created_at,l.id limit 1
    ), products as materialized (
      select p.id,p.is_sold_out,p.track_inventory,p.coffee_bean_product_id,p.coffee_grams_per_sale
      from public.pos_products p
      where p.is_active and (p_branch is null or p.branch_id=p_branch
        or p.branch_id is null or p_branch=any(p.visible_branch_ids))
    ), raw_requirements as (
      select p.id as menu_product_id,p.id as needed_product_id,1::numeric as qty
      from products p where p.track_inventory
      union all
      select p.id,p.coffee_bean_product_id,round(p.coffee_grams_per_sale,3)
      from products p where p.coffee_bean_product_id is not null and p.coffee_grams_per_sale>0
    ), requirements as (
      select r.menu_product_id,r.needed_product_id,sum(r.qty) as qty
      from raw_requirements r group by r.menu_product_id,r.needed_product_id
    ), insufficient as (
      select distinct r.menu_product_id from requirements r
      left join public.location_product_stock s
        on s.location_id=(select l.id from location l) and s.product_id=r.needed_product_id
      where coalesce(s.qty,0)<r.qty or coalesce(s.qty,0)<=0
    ), availability as (
      select p.id,p.is_sold_out,case
        when not coalesce(p.track_inventory,false) and not
          (p.coffee_bean_product_id is not null and coalesce(p.coffee_grams_per_sale,0)>0)
          then 'Stock not set up'::text
        when not exists(select 1 from location) then 'Branch stock not set up'::text
        when i.menu_product_id is not null then 'Out of stock'::text
        else null::text end as stock_reason
      from products p left join insufficient i on i.menu_product_id=p.id
    )
    select a.id,coalesce(a.is_sold_out,false) or a.stock_reason is not null,
      case when a.is_sold_out then 'Sold out'::text else a.stock_reason end
    from availability a;
end $function$;
-- CREATE OR REPLACE preserves the existing anon/authenticated execute ACL.
