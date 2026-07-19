-- Voids now reverse the loyalty stamps the voided order awarded.
-- Same body as 20260718180500; adds a best-effort stamp clawback after the
-- shift-totals update. Rewards already granted are left untouched (staff
-- handle those at the counter); the counters simply never go below zero.

create or replace function public.void_pos_order(
  p_order_id uuid,
  p_reason text,
  p_served_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pos_orders;
begin
  select * into v_order from pos_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'voided' then
    return jsonb_build_object('already_voided', true);
  end if;

  update pos_orders
     set status = 'voided', voided_at = now(), void_reason = p_reason
   where id = p_order_id;

  insert into pos_inventory_movements (
    branch_id, product_id, movement_type, quantity, stock_before, stock_after, reference_id, notes
  )
  select v_order.branch_id, oi.product_id, 'void',
         oi.quantity - coalesce(oi.refunded_qty, 0),
         p.stock_qty,
         p.stock_qty + oi.quantity - coalesce(oi.refunded_qty, 0),
         v_order.id,
         'Void of order ' || v_order.order_number
    from pos_order_items oi
    join pos_products p on p.id = oi.product_id
   where oi.order_id = v_order.id
     and p.track_inventory = true
     and oi.quantity > coalesce(oi.refunded_qty, 0);

  update pos_products p
     set stock_qty = p.stock_qty + oi.quantity - coalesce(oi.refunded_qty, 0),
         updated_at = now()
    from pos_order_items oi
   where oi.order_id = v_order.id
     and p.id = oi.product_id
     and p.track_inventory = true
     and oi.quantity > coalesce(oi.refunded_qty, 0);

  if v_order.shift_id is not null then
    update pos_shifts
       set total_sales = total_sales - v_order.total,
           total_orders = greatest(0, total_orders - 1),
           total_cash_sales = total_cash_sales - case when v_order.payment_method = 'cash' then v_order.total
                                                       when v_order.payment_method = 'split' then v_order.total - coalesce(v_order.card_amount, 0)
                                                       else 0 end,
           total_card_sales = total_card_sales - case when v_order.payment_method = 'card' then v_order.total
                                                       when v_order.payment_method = 'split' then coalesce(v_order.card_amount, 0)
                                                       else 0 end,
           total_presto_sales = total_presto_sales - case when v_order.payment_method = 'presto' then v_order.total else 0 end,
           total_presto_uncollected = greatest(0, total_presto_uncollected - case
             when v_order.payment_method = 'presto' and v_order.presto_collected is not true then v_order.total else 0 end),
           total_discounts = total_discounts - coalesce(v_order.discount_amount, 0),
           expected_cash = expected_cash - case when v_order.payment_method = 'cash' then v_order.total
                                               when v_order.payment_method = 'split' then v_order.total - coalesce(v_order.card_amount, 0)
                                               else 0 end
     where id = v_order.shift_id and status = 'open';
  end if;

  if v_order.loyalty_stamps_awarded > 0 and v_order.loyalty_customer_id is not null then
    begin
      update loyalty_customers
         set current_stamps = greatest(0, coalesce(current_stamps, 0) - v_order.loyalty_stamps_awarded),
             total_stamps = greatest(0, coalesce(total_stamps, 0) - v_order.loyalty_stamps_awarded),
             updated_at = now()
       where id = v_order.loyalty_customer_id;
    exception when others then
      null;
    end;
  end if;

  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  values (
    v_order.branch_id, auth.uid(), p_served_by, 'order_voided', 'pos_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'order_number', v_order.order_number, 'total', v_order.total)
  );

  return jsonb_build_object('voided', true, 'order_number', v_order.order_number);
end;
$$;

grant execute on function public.void_pos_order(uuid, text, uuid) to authenticated;
