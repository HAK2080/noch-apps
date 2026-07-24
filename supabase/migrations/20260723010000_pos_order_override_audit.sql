-- Extend shared-terminal manager override auditing beyond discount approval.
-- Adds a generic order-action audit hook for refunds and voids.

create or replace function public.annotate_pos_order_override(
  p_order_id uuid,
  p_override_action text,
  p_manager_override_by uuid,
  p_note text default null,
  p_served_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pos_orders;
  v_action text := lower(coalesce(p_override_action, ''));
begin
  if p_manager_override_by is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_manager');
  end if;

  if v_action not in ('refund', 'void') then
    raise exception 'Unsupported override action: %', p_override_action;
  end if;

  select * into v_order
  from pos_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  insert into pos_audit_log(
    branch_id, actor_user_id, served_by, approved_by, action, entity_type, entity_id, metadata
  )
  values (
    v_order.branch_id,
    auth.uid(),
    coalesce(p_served_by, v_order.served_by),
    p_manager_override_by,
    'manager_override_applied',
    'pos_orders',
    p_order_id,
    jsonb_build_object(
      'override_action', v_action,
      'order_number', v_order.order_number,
      'payment_method', v_order.payment_method,
      'total', v_order.total,
      'note', nullif(p_note, '')
    )
  );

  return jsonb_build_object('ok', true);
end
$$;

grant execute on function public.annotate_pos_order_override(uuid, text, uuid, text, uuid)
  to authenticated, service_role;
