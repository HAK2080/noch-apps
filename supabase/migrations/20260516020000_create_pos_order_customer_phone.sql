-- Extend create_pos_order to accept customer_phone (WhatsApp number)
-- captured at the cart. The pos_orders.customer_phone column already
-- exists (used by submit_guest_order for online orders); we just need
-- the counter-sale RPC to populate it too.
--
-- This will later feed loyalty linking — phone is the natural join
-- key into loyalty_customers.

DROP FUNCTION IF EXISTS public.create_pos_order(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, text,
  numeric, numeric, numeric, uuid, timestamptz, text, jsonb, text
);

CREATE OR REPLACE FUNCTION public.create_pos_order(
  p_idempotency_key uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_served_by uuid,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_discount_pct numeric,
  p_total numeric,
  p_payment_method text,
  p_cash_tendered numeric,
  p_change_due numeric,
  p_card_amount numeric,
  p_loyalty_customer_id uuid,
  p_client_created_at timestamptz,
  p_offline_order_number text,
  p_items jsonb,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing_order pos_orders;
  v_order_id uuid;
  v_order_number text;
  v_branch_code text;
  v_date_str text;
  v_seq int;
  v_item jsonb;
  v_mod jsonb;
  v_item_id uuid;
  v_stock_before numeric;
  v_stock_after numeric;
  v_presto_collected boolean := null;
  v_cash_amt numeric := 0;
  v_card_amt numeric := 0;
  v_presto_amt numeric := 0;
  v_presto_uncollected_amt numeric := 0;
  v_effective_created_at timestamptz;
  v_settings pos_settings;
  v_stamps_awarded int := 0;
  v_customer_name text;
  v_customer_phone text;
begin
  v_customer_name  := nullif(trim(coalesce(p_customer_name, '')), '');
  v_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');

  if p_idempotency_key is not null then
    select * into v_existing_order
      from pos_orders
      where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'order', row_to_json(v_existing_order),
        'items', coalesce(
          (select jsonb_agg(row_to_json(oi)) from pos_order_items oi where oi.order_id = v_existing_order.id),
          '[]'::jsonb
        ),
        'idempotent_replay', true
      );
    end if;
  end if;

  v_effective_created_at := coalesce(p_client_created_at, now());

  perform 1 from pos_branches where id = p_branch_id for update;

  if p_offline_order_number is not null and length(p_offline_order_number) > 0 then
    v_order_number := p_offline_order_number;
  else
    select
      upper(coalesce(
        nullif(regexp_replace(string_agg(left(w,1),'') filter (where w ~ '^[A-Za-z]'), '[^A-Za-z]', '', 'g'), ''),
        'POS'
      ))
      into v_branch_code
      from (
        select unnest(string_to_array((select name from pos_branches where id = p_branch_id), ' ')) as w
      ) sub;
    v_branch_code := left(coalesce(v_branch_code, 'POS'), 3);
    v_date_str := to_char(v_effective_created_at, 'YYYYMMDD');
    select count(*) + 1 into v_seq
      from pos_orders
      where branch_id = p_branch_id
        and created_at >= date_trunc('day', v_effective_created_at)
        and created_at <  date_trunc('day', v_effective_created_at) + interval '1 day';
    v_order_number := v_branch_code || '-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');
  end if;

  if p_payment_method = 'presto' then
    v_presto_collected := false;
    v_presto_amt := p_total;
    v_presto_uncollected_amt := p_total;
  end if;
  if p_payment_method = 'cash' then v_cash_amt := p_total;
  elsif p_payment_method = 'card' then v_card_amt := p_total;
  elsif p_payment_method = 'split' then
    v_card_amt := coalesce(p_card_amount, 0);
    v_cash_amt := p_total - v_card_amt;
  end if;

  select * into v_settings from pos_settings where branch_id = p_branch_id;
  if p_loyalty_customer_id is not null and v_settings is not null then
    if coalesce(v_settings.stamp_per_order, 0) > 0 then
      v_stamps_awarded := v_settings.stamp_per_order;
    end if;
    if coalesce(v_settings.stamp_per_amount, 0) > 0 then
      v_stamps_awarded := v_stamps_awarded + floor(p_total / v_settings.stamp_per_amount)::int;
    end if;
  end if;

  insert into pos_orders (
    branch_id, shift_id, order_number,
    subtotal, discount_amount, discount_pct, total,
    payment_method, cash_tendered, change_due, card_amount,
    loyalty_customer_id, loyalty_stamps_awarded, status, synced,
    idempotency_key, served_by, client_created_at, created_at,
    presto_collected,
    customer_name, customer_phone
  ) values (
    p_branch_id, p_shift_id, v_order_number,
    p_subtotal, p_discount_amount, p_discount_pct, p_total,
    p_payment_method, p_cash_tendered, p_change_due, p_card_amount,
    p_loyalty_customer_id, v_stamps_awarded, 'completed', true,
    p_idempotency_key, p_served_by, v_effective_created_at, v_effective_created_at,
    v_presto_collected,
    v_customer_name, v_customer_phone
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into pos_order_items (
      order_id, product_id, product_name, product_name_ar,
      unit_price, quantity, total, notes
    ) values (
      v_order_id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      v_item->>'product_name_ar',
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric * (v_item->>'quantity')::int,
      v_item->>'notes'
    )
    returning id into v_item_id;

    if v_item ? 'modifiers' and jsonb_typeof(v_item->'modifiers') = 'array' then
      for v_mod in select * from jsonb_array_elements(v_item->'modifiers')
      loop
        insert into pos_order_item_modifiers
          (order_item_id, modifier_id, group_name, modifier_name, modifier_name_ar, price_delta)
        values (
          v_item_id,
          nullif(v_mod->>'modifier_id', '')::uuid,
          v_mod->>'group_name',
          v_mod->>'modifier_name',
          v_mod->>'modifier_name_ar',
          coalesce((v_mod->>'price_delta')::numeric, 0)
        );
      end loop;
    end if;

    if (v_item->>'track_inventory')::boolean and (v_item->>'product_id') is not null then
      update pos_products
        set stock_qty = stock_qty - (v_item->>'quantity')::numeric,
            updated_at = now()
        where id = (v_item->>'product_id')::uuid
        returning stock_qty + (v_item->>'quantity')::numeric, stock_qty
          into v_stock_before, v_stock_after;
      if v_stock_before is not null then
        insert into pos_inventory_movements (
          branch_id, product_id, movement_type, quantity, stock_before, stock_after, reference_id, notes
        ) values (
          p_branch_id, (v_item->>'product_id')::uuid, 'sale',
          -((v_item->>'quantity')::numeric), v_stock_before, v_stock_after,
          v_order_id, 'Order ' || v_order_number
        );
      end if;
    end if;
  end loop;

  if p_shift_id is not null then
    update pos_shifts
      set total_sales = total_sales + p_total,
          total_orders = total_orders + 1,
          total_cash_sales = total_cash_sales + v_cash_amt,
          total_card_sales = total_card_sales + v_card_amt,
          total_presto_sales = coalesce(total_presto_sales, 0) + v_presto_amt,
          total_presto_uncollected = coalesce(total_presto_uncollected, 0) + v_presto_uncollected_amt,
          total_discounts = total_discounts + coalesce(p_discount_amount, 0),
          expected_cash = expected_cash + v_cash_amt
      where id = p_shift_id and status = 'open';

    if p_served_by is not null then
      update pos_shift_attendees
        set total_sales = total_sales + p_total,
            total_orders = total_orders + 1
        where shift_id = p_shift_id and user_id = p_served_by;
    end if;
  end if;

  if v_stamps_awarded > 0 and p_loyalty_customer_id is not null then
    begin
      update loyalty_customers
        set stamps = coalesce(stamps, 0) + v_stamps_awarded,
            updated_at = now()
        where id = p_loyalty_customer_id;
    exception when undefined_column then
      null;
    end;
  end if;

  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  values (
    p_branch_id, auth.uid(), p_served_by, 'order_created', 'pos_orders', v_order_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'total', p_total,
      'payment_method', p_payment_method,
      'discount_amount', p_discount_amount,
      'is_offline_sync', p_offline_order_number is not null,
      'stamps_awarded', v_stamps_awarded,
      'customer_name', v_customer_name,
      'customer_phone', v_customer_phone
    )
  );

  return jsonb_build_object(
    'order', (select row_to_json(o) from pos_orders o where o.id = v_order_id),
    'items', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'order_id', oi.order_id, 'product_id', oi.product_id,
        'product_name', oi.product_name, 'product_name_ar', oi.product_name_ar,
        'unit_price', oi.unit_price, 'quantity', oi.quantity, 'total', oi.total,
        'notes', oi.notes,
        'modifiers', coalesce(
          (select jsonb_agg(row_to_json(m)) from pos_order_item_modifiers m where m.order_item_id = oi.id),
          '[]'::jsonb
        )
      )) from pos_order_items oi where oi.order_id = v_order_id),
      '[]'::jsonb
    ),
    'idempotent_replay', false
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.create_pos_order(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, text,
  numeric, numeric, numeric, uuid, timestamptz, text, jsonb, text, text
) TO authenticated, service_role, anon;
