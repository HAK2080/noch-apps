-- Update submit_guest_order to support table ordering (V3.2.0)

CREATE OR REPLACE FUNCTION submit_guest_order(
  p_branch_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_table_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric := 0;
  v_item jsonb;
  v_product record;
  v_customer_id uuid;
BEGIN
  -- Validate inputs
  IF p_payment_method NOT IN ('pickup', 'bank_transfer', 'cod') THEN
    RETURN jsonb_build_object('error', 'Invalid payment method');
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('error', 'Order must contain at least one item');
  END IF;

  -- Create order
  v_order_number := 'ONL-' || TO_CHAR(now(), 'YYYYMMDD-HH24MMSS');

  INSERT INTO pos_orders (
    branch_id, order_number, source, is_guest, status,
    customer_name, customer_phone, payment_method,
    table_number, subtotal, total
  ) VALUES (
    p_branch_id,
    v_order_number,
    'online',
    true,
    'pending',
    p_customer_name,
    p_customer_phone,
    p_payment_method,
    p_table_number,
    0,
    0
  ) RETURNING id INTO v_order_id;

  -- Add items and calculate total
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    SELECT * FROM pos_products
    WHERE id = (v_item->>'product_id')::uuid
    AND branch_id = p_branch_id
    AND is_active = true
    INTO v_product;

    IF v_product IS NULL THEN
      RETURN jsonb_build_object('error', 'Product not found or inactive: ' || (v_item->>'product_id'));
    END IF;

    INSERT INTO pos_order_items (
      order_id, product_id, product_name, product_name_ar,
      unit_price, quantity, total
    ) VALUES (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.name_ar,
      v_product.price,
      (v_item->>'quantity')::integer,
      v_product.price * (v_item->>'quantity')::integer
    );

    v_subtotal := v_subtotal + (v_product.price * (v_item->>'quantity')::integer);
  END LOOP;

  -- Update order totals
  UPDATE pos_orders SET
    subtotal = v_subtotal,
    total = v_subtotal
  WHERE id = v_order_id;

  -- Try to create/link loyalty customer
  BEGIN
    INSERT INTO loyalty_customers (phone, full_name)
    VALUES (p_customer_phone, p_customer_name)
    RETURNING id INTO v_customer_id;
  EXCEPTION WHEN UNIQUE_VIOLATION THEN
    SELECT id INTO v_customer_id FROM loyalty_customers
    WHERE phone = p_customer_phone LIMIT 1;
  END;

  IF v_customer_id IS NOT NULL THEN
    UPDATE pos_orders SET loyalty_customer_id = v_customer_id
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_subtotal,
    'payment_method', p_payment_method,
    'table_number', p_table_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_guest_order(uuid, text, text, text, jsonb, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
