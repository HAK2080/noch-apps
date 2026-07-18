-- P0 guest-order and marketing constraint fixes.

create sequence if not exists public.online_order_number_seq;

-- Replace every historical overload so PostgREST cannot select a weaker RPC.
drop function if exists public.submit_guest_order(uuid, text, text, text, jsonb);
drop function if exists public.submit_guest_order(uuid, text, text, text, jsonb, text);
drop function if exists public.submit_guest_order(uuid, text, text, text, jsonb, text, double precision, double precision);

create or replace function public.submit_guest_order(
  p_branch_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_table_number text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_product pos_products;
  v_customer_id uuid;
  v_pickup_code text;
  v_branch pos_branches;
  v_distance_m double precision;
  v_qty int;
  v_coupon_result jsonb;
begin
  if p_payment_method not in ('pickup', 'bank_transfer', 'cod') then
    return jsonb_build_object('error', 'Invalid payment method');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('error', 'Order must contain at least one item');
  end if;

  if p_lat is not null and p_lng is not null then
    select * into v_branch from pos_branches where id = p_branch_id;
    if not found then
      raise exception 'Branch not found';
    end if;
    if v_branch.lat is not null and v_branch.geofence_radius_m is not null and v_branch.geofence_radius_m > 0 then
      v_distance_m := 6371000 * acos(
        least(1.0, cos(radians(p_lat)) * cos(radians(v_branch.lat))
          * cos(radians(v_branch.lng) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(v_branch.lat)))
      );
      if v_distance_m > v_branch.geofence_radius_m then
        return jsonb_build_object(
          'error', 'on_site_required',
          'reason', 'outside_geofence',
          'distance_m', round(v_distance_m)
        );
      end if;
    end if;
  end if;

  v_order_number := 'ONL-' || to_char(now(), 'YYYYMMDD') || '-'
    || lpad(nextval('public.online_order_number_seq')::text, 8, '0');
  v_pickup_code := lpad((floor(random() * 9000) + 1000)::text, 4, '0');

  insert into pos_orders (
    branch_id, order_number, source, is_guest, status,
    customer_name, customer_phone, payment_method,
    table_number, subtotal, discount_amount, total,
    awaiting_staff_confirm, pickup_code
  ) values (
    p_branch_id, v_order_number, 'online', true, 'pending',
    p_customer_name, p_customer_phone, p_payment_method,
    p_table_number, 0, 0, 0,
    true, v_pickup_code
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero';
    end if;

    select * into v_product
      from pos_products
     where id = (v_item->>'product_id')::uuid
       and is_active = true;
    if not found then
      raise exception 'Product not found: %', v_item->>'product_id';
    end if;

    insert into pos_order_items (
      order_id, product_id, product_name, product_name_ar,
      unit_price, quantity, total
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.name_ar,
      v_product.price, v_qty, v_product.price * v_qty
    );
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    v_coupon_result := public.apply_coupon(p_coupon_code, p_branch_id, v_subtotal);
    if coalesce((v_coupon_result->>'valid')::boolean, false) is not true then
      raise exception 'Invalid coupon: %', coalesce(v_coupon_result->>'message', 'code rejected');
    end if;
    v_discount := coalesce((v_coupon_result->>'discount_amount')::numeric, 0);
    update pos_coupons
       set used_count = coalesce(used_count, 0) + 1
     where lower(code) = lower(trim(p_coupon_code));
  end if;
  v_total := greatest(0, v_subtotal - v_discount);

  update pos_orders
     set subtotal = v_subtotal,
         discount_amount = v_discount,
         discount_pct = case when v_subtotal > 0 then round(v_discount / v_subtotal * 100, 2) else 0 end,
         total = v_total
   where id = v_order_id;

  begin
    insert into loyalty_customers (phone, full_name)
    values (p_customer_phone, p_customer_name)
    returning id into v_customer_id;
  exception when unique_violation then
    select id into v_customer_id
      from loyalty_customers
     where phone = p_customer_phone
     limit 1;
  end;
  if v_customer_id is not null then
    update pos_orders set loyalty_customer_id = v_customer_id where id = v_order_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'total', v_total,
    'payment_method', p_payment_method,
    'table_number', p_table_number,
    'pickup_code', v_pickup_code
  );
end;
$$;

grant execute on function public.submit_guest_order(
  uuid, text, text, text, jsonb, text, double precision, double precision, text
) to anon, authenticated, service_role;

-- Campaign UI segment/status values were added after the original CHECKs.
alter table public.marketing_campaigns
  drop constraint if exists marketing_campaigns_segment_check;
alter table public.marketing_campaigns
  add constraint marketing_campaigns_segment_check
  check (segment in (
    'vip', 'regular', 'occasional', 'at_risk', 'churned', 'new', 'all',
    'birthday_this_week', 'inactive', 'reward_ready'
  ));

alter table public.marketing_campaigns
  drop constraint if exists marketing_campaigns_status_check;
alter table public.marketing_campaigns
  add constraint marketing_campaigns_status_check
  check (status in ('draft', 'scheduled', 'approved', 'sending', 'sent', 'complete', 'failed', 'cancelled'));
