-- switch_pos_order_payment(order_id, new_method, served_by) — corrects
-- a payment method on a completed order. Only swaps between 'cash' and
-- 'card' (not split / presto / pickup which need richer handling).
--
-- The shift totals are moved from one bucket to the other so the
-- end-of-day cash count stays accurate.
--
-- Use case: cashier hit "Card" but customer paid cash, or vice versa.

CREATE OR REPLACE FUNCTION switch_pos_order_payment(
  p_order_id uuid,
  p_new_method text,
  p_served_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order pos_orders;
  v_old text;
  v_amount numeric;
BEGIN
  IF p_new_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'switch only supports cash or card, got %', p_new_method;
  END IF;

  SELECT * INTO v_order FROM pos_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF v_order.status = 'voided' THEN
    RAISE EXCEPTION 'cannot switch payment on a voided order';
  END IF;

  v_old := v_order.payment_method;
  v_amount := v_order.total;

  IF v_old NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'order is % — only cash↔card swap is supported here', v_old;
  END IF;

  IF v_old = p_new_method THEN
    RETURN jsonb_build_object('changed', false, 'method', p_new_method);
  END IF;

  -- Flip the order
  UPDATE pos_orders
     SET payment_method = p_new_method,
         -- Clear cash-specific fields when switching to card so
         -- subsequent receipts don't show stale tendered/change.
         cash_tendered = CASE WHEN p_new_method = 'card' THEN NULL ELSE cash_tendered END,
         change_due    = CASE WHEN p_new_method = 'card' THEN NULL ELSE change_due END
   WHERE id = p_order_id;

  -- Move the amount between shift buckets (only if shift is still open)
  IF v_order.shift_id IS NOT NULL THEN
    IF p_new_method = 'card' THEN
      -- was cash, now card
      UPDATE pos_shifts
         SET total_cash_sales = COALESCE(total_cash_sales, 0) - v_amount,
             total_card_sales = COALESCE(total_card_sales, 0) + v_amount,
             expected_cash    = COALESCE(expected_cash, 0) - v_amount
       WHERE id = v_order.shift_id AND status = 'open';
    ELSE
      -- was card, now cash
      UPDATE pos_shifts
         SET total_card_sales = COALESCE(total_card_sales, 0) - v_amount,
             total_cash_sales = COALESCE(total_cash_sales, 0) + v_amount,
             expected_cash    = COALESCE(expected_cash, 0) + v_amount
       WHERE id = v_order.shift_id AND status = 'open';
    END IF;
  END IF;

  -- Audit
  INSERT INTO pos_audit_log
    (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  VALUES (
    v_order.branch_id, auth.uid(), p_served_by, 'switch_payment_method',
    'pos_orders', p_order_id,
    jsonb_build_object('from', v_old, 'to', p_new_method, 'amount', v_amount)
  );

  RETURN jsonb_build_object(
    'changed', true,
    'from', v_old,
    'to', p_new_method,
    'amount', v_amount,
    'order_number', v_order.order_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION switch_pos_order_payment(uuid, text, uuid)
  TO authenticated, service_role;
