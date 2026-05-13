-- Online order approval flow
-- Adds the columns and RPCs that POSTerminal expects but were never created.

-- 1. Columns on pos_orders
ALTER TABLE pos_orders
  ADD COLUMN IF NOT EXISTS awaiting_staff_confirm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_code            text;

-- 2. Update submit_guest_order to set awaiting_staff_confirm + generate pickup_code
CREATE OR REPLACE FUNCTION submit_guest_order(
  p_branch_id      uuid,
  p_customer_name  text,
  p_customer_phone text,
  p_payment_method text,
  p_items          jsonb,
  p_table_number   text  DEFAULT NULL,
  p_lat            double precision DEFAULT NULL,
  p_lng            double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id     uuid;
  v_order_number text;
  v_subtotal     numeric := 0;
  v_item         jsonb;
  v_product      record;
  v_customer_id  uuid;
  v_pickup_code  text;
  v_branch       record;
  v_distance_m   double precision;
BEGIN
  IF p_payment_method NOT IN ('pickup', 'bank_transfer', 'cod') THEN
    RETURN jsonb_build_object('error', 'Invalid payment method');
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('error', 'Order must contain at least one item');
  END IF;

  -- Geofence check (if branch has lat/lng and radius set)
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT * INTO v_branch FROM pos_branches WHERE id = p_branch_id;
    IF v_branch.lat IS NOT NULL AND v_branch.geofence_radius_m IS NOT NULL AND v_branch.geofence_radius_m > 0 THEN
      v_distance_m := 6371000 * acos(
        least(1.0, cos(radians(p_lat)) * cos(radians(v_branch.lat))
          * cos(radians(v_branch.lng) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(v_branch.lat)))
      );
      IF v_distance_m > v_branch.geofence_radius_m THEN
        RETURN jsonb_build_object(
          'error', 'on_site_required',
          'reason', 'outside_geofence',
          'distance_m', round(v_distance_m)
        );
      END IF;
    END IF;
  END IF;

  -- Generate IDs
  v_order_number := 'ONL-' || TO_CHAR(now(), 'YYYYMMDD-HH24MISS');
  v_pickup_code  := LPAD((FLOOR(RANDOM() * 9000) + 1000)::text, 4, '0');

  INSERT INTO pos_orders (
    branch_id, order_number, source, is_guest, status,
    customer_name, customer_phone, payment_method,
    table_number, subtotal, total,
    awaiting_staff_confirm, pickup_code
  ) VALUES (
    p_branch_id, v_order_number, 'online', true, 'pending',
    p_customer_name, p_customer_phone, p_payment_method,
    p_table_number, 0, 0,
    true, v_pickup_code
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product FROM pos_products
    WHERE id = (v_item->>'product_id')::uuid AND is_active = true;

    IF v_product IS NULL THEN
      RETURN jsonb_build_object('error', 'Product not found: ' || (v_item->>'product_id'));
    END IF;

    INSERT INTO pos_order_items (
      order_id, product_id, product_name, product_name_ar,
      unit_price, quantity, total
    ) VALUES (
      v_order_id, v_product.id, v_product.name, v_product.name_ar,
      v_product.price, (v_item->>'quantity')::integer,
      v_product.price * (v_item->>'quantity')::integer
    );
    v_subtotal := v_subtotal + (v_product.price * (v_item->>'quantity')::integer);
  END LOOP;

  UPDATE pos_orders SET subtotal = v_subtotal, total = v_subtotal WHERE id = v_order_id;

  BEGIN
    INSERT INTO loyalty_customers (phone, full_name)
    VALUES (p_customer_phone, p_customer_name)
    RETURNING id INTO v_customer_id;
  EXCEPTION WHEN UNIQUE_VIOLATION THEN
    SELECT id INTO v_customer_id FROM loyalty_customers WHERE phone = p_customer_phone LIMIT 1;
  END;
  IF v_customer_id IS NOT NULL THEN
    UPDATE pos_orders SET loyalty_customer_id = v_customer_id WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'order_id',      v_order_id,
    'order_number',  v_order_number,
    'total',         v_subtotal,
    'payment_method', p_payment_method,
    'table_number',  p_table_number,
    'pickup_code',   v_pickup_code
  );
END;
$$;

-- 3. approve_online_order — staff accepts; moves to in_progress
CREATE OR REPLACE FUNCTION approve_online_order(p_order_id uuid, p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE pos_orders
  SET status = 'in_progress', awaiting_staff_confirm = false
  WHERE id = p_order_id AND branch_id = p_branch_id AND source = 'online';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. cancel_online_order — staff rejects
CREATE OR REPLACE FUNCTION cancel_online_order(p_order_id uuid, p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE pos_orders
  SET status = 'cancelled', awaiting_staff_confirm = false
  WHERE id = p_order_id AND branch_id = p_branch_id AND source = 'online';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. confirm_pickup_order — customer shows pickup code, staff marks completed
CREATE OR REPLACE FUNCTION confirm_pickup_order(p_pickup_code text, p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order record;
BEGIN
  SELECT * INTO v_order FROM pos_orders
  WHERE pickup_code = p_pickup_code AND branch_id = p_branch_id
    AND status IN ('pending', 'in_progress')
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or already used pickup code');
  END IF;
  UPDATE pos_orders SET status = 'completed', awaiting_staff_confirm = false
  WHERE id = v_order.id;
  RETURN jsonb_build_object('success', true, 'order_number', v_order.order_number, 'total', v_order.total);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_online_order(uuid, uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_online_order(uuid, uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION confirm_pickup_order(text, uuid)   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_guest_order(uuid, text, text, text, jsonb, text, double precision, double precision)
  TO anon, authenticated, service_role;
