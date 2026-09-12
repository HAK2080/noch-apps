-- Forward-only safety fix. No historical order, stock or loyalty balance rewrite.
begin;

create table public.pos_online_payments (
  order_id uuid primary key references public.pos_orders(id) on delete restrict,
  branch_id uuid not null references public.pos_branches(id),
  shift_id uuid not null references public.pos_shifts(id),
  actor_profile_id uuid not null references public.profiles(id),
  payment_method text not null check(payment_method in ('cash','card','split')),
  total numeric not null check(total >= 0 and total::text not in ('NaN','Infinity','-Infinity')),
  cash_tendered numeric,
  card_amount numeric not null,
  change_due numeric not null,
  paid_at timestamptz not null default now()
);
alter table public.pos_online_payments enable row level security;
revoke all on public.pos_online_payments from public,anon,authenticated;

create function public.assert_online_order_staff(p_branch_id uuid) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare v_actor profiles;
begin
  select * into v_actor from profiles where (id=auth.uid() or auth_user_id=auth.uid())
    and coalesce(is_active,true) and role in ('owner','supervisor','staff','limited_staff') limit 1;
  if v_actor.id is null then raise exception 'Active POS staff sign-in required'; end if;
  if v_actor.role not in ('owner','supervisor') and v_actor.branch_id is distinct from p_branch_id
    and not exists(select 1 from staff_branches where user_id=v_actor.id and branch_id=p_branch_id) then
    raise exception 'POS branch access required';
  end if;
  return v_actor.id;
end $$;
revoke all on function public.assert_online_order_staff(uuid) from public,anon,authenticated;

-- A stale client must never bypass payment by calling the old Accept/Collected RPCs.
create or replace function public.approve_online_order(p_order_id uuid,p_branch_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform assert_online_order_staff(p_branch_id);
  raise exception 'Online order payment required. Refresh POS and collect payment.';
end $$;
create or replace function public.confirm_pickup_order(p_pickup_code text,p_branch_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform assert_online_order_staff(p_branch_id);
  raise exception 'Online order payment required. Refresh POS and collect payment.';
end $$;
revoke all on function public.approve_online_order(uuid,uuid) from public,anon,authenticated;
revoke all on function public.confirm_pickup_order(text,uuid) from public,anon,authenticated;
grant execute on function public.approve_online_order(uuid,uuid) to authenticated;
grant execute on function public.confirm_pickup_order(text,uuid) to authenticated;

create or replace function public.cancel_online_order(p_order_id uuid,p_branch_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order pos_orders;
begin
  perform assert_online_order_staff(p_branch_id);
  select * into v_order from pos_orders where id=p_order_id and branch_id=p_branch_id and source='online' for update;
  if not found then raise exception 'Online order not found'; end if;
  if v_order.status='cancelled' then return jsonb_build_object('success',true,'already_cancelled',true); end if;
  if v_order.status not in ('pending','in_progress') or exists(select 1 from pos_online_payments where order_id=p_order_id) then
    raise exception 'Paid orders require the refund workflow';
  end if;
  update pos_orders set status='cancelled',awaiting_staff_confirm=false where id=p_order_id;
  return jsonb_build_object('success',true);
end $$;
revoke all on function public.cancel_online_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_online_order(uuid,uuid) to authenticated;

create function public.guard_online_order_payment() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_online boolean:=new.source='online';
begin
  if tg_op='UPDATE' then v_online:=v_online or old.source='online'; end if;
  if v_online and new.status='completed' then
    if tg_op='UPDATE' then
      if old.status='completed' then return new; end if;
    end if;
    if new.source is distinct from 'online' then raise exception 'Online order source cannot change at payment'; end if;
    perform assert_online_order_staff(new.branch_id);
    if not exists(select 1 from pos_online_payments p where p.order_id=new.id and p.branch_id=new.branch_id
      and p.total=new.total and p.shift_id=new.shift_id and p.payment_method=new.payment_method
      and p.card_amount=new.card_amount and p.cash_tendered is not distinct from new.cash_tendered
      and p.change_due=new.change_due) then
      raise exception 'Online order payment required. Refresh POS and collect payment.';
    end if;
  end if;
  return new;
end $$;
create trigger pos_orders_guard_online_payment before insert or update of status on public.pos_orders
  for each row execute function public.guard_online_order_payment();

-- This is the ONE tracked-stock consumption path for pending -> completed orders.
-- Direct POS inserts retain their existing RPC consumption path. Bean triggers stay intact.
create or replace function public.guard_order_completion_stock() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_items jsonb; v_item record; v_before numeric; v_after numeric;
begin
  if old.status='completed' or new.status<>'completed' then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity-coalesce(refunded_qty,0)))
    filter(where quantity>coalesce(refunded_qty,0)),'[]'::jsonb) into v_items from pos_order_items where order_id=new.id;
  perform assert_sale_stock(new.branch_id,v_items);
  for v_item in select i.product_id,sum(i.quantity-coalesce(i.refunded_qty,0)) qty
    from pos_order_items i join pos_products p on p.id=i.product_id
    where i.order_id=new.id and p.track_inventory and i.quantity>coalesce(i.refunded_qty,0)
    group by i.product_id order by i.product_id loop
    -- Keep legacy aggregate stock correct if this branch has no location row.
    -- The existing mirror reconciles that aggregate from location stock otherwise.
    update pos_products set stock_qty=stock_qty-v_item.qty,updated_at=now() where id=v_item.product_id
      returning stock_qty+v_item.qty,stock_qty into v_before,v_after;
    insert into pos_inventory_movements(branch_id,product_id,movement_type,quantity,stock_before,stock_after,reference_id,notes)
      values(new.branch_id,v_item.product_id,'sale',-v_item.qty,v_before,v_after,new.id,'Paid online order completion');
  end loop;
  return new;
end $$;

-- The existing tender trigger treated first-time online completion as a payment
-- correction (or recorded no tender). Handle first settlement, then preserve the
-- installed correction/void implementation unchanged for all other transitions.
alter function public.pos_capture_order_tender_events() rename to pos_capture_order_tender_events_before_online_payment;
create function public.pos_capture_order_tender_events() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if old.status not in ('completed','voided') and new.status='completed' then
      perform pos_record_tender_legs(new.id,new.shift_id,'sale',1,new.total,new.total,
        new.payment_method,new.card_amount,now(),'recorded','order:'||new.id::text||':sale',new.served_by,'{}'::jsonb);
    end if;
  end if;
  return new;
end $$;
-- Existing trigger still references its original function OID after the rename.
-- Its WHEN excludes first-time completion, preventing spurious correction legs.
drop trigger pos_capture_order_tender_events on public.pos_orders;
create trigger pos_capture_order_tender_insert after insert on public.pos_orders
  for each row execute function pos_capture_order_tender_events_before_online_payment();
create trigger pos_capture_order_tender_existing after update of status,payment_method,card_amount on public.pos_orders
  for each row when(old.status in ('completed','voided') or new.status<>'completed')
  execute function pos_capture_order_tender_events_before_online_payment();
create trigger pos_capture_order_tender_first_payment after update of status on public.pos_orders
  for each row execute function pos_capture_order_tender_events();

create function public.complete_online_order_payment(
  p_order_id uuid,p_branch_id uuid,p_shift_id uuid,p_expected_total numeric,
  p_payment_method text,p_cash_tendered numeric,p_card_amount numeric default 0
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_order pos_orders; v_paid pos_online_payments; v_cash numeric; v_card numeric; v_change numeric; v_preparing boolean;
begin
  v_actor:=assert_online_order_staff(p_branch_id);
  select * into v_order from pos_orders where id=p_order_id and branch_id=p_branch_id and source='online' for update;
  if not found then raise exception 'Online order not found'; end if;
  select * into v_paid from pos_online_payments where order_id=p_order_id;
  if found then
    if v_order.status<>'completed' then raise exception 'Paid orders require the refund workflow'; end if;
    return jsonb_build_object('success',true,'already_completed',true,'order',to_jsonb(v_order));
  end if;
  if v_order.status not in ('pending','in_progress') then raise exception 'Order is no longer awaiting payment'; end if;
  v_preparing:=v_order.status='in_progress';
  if v_order.total is null or v_order.total<0 or v_order.total::text in ('NaN','Infinity','-Infinity')
    or p_expected_total is distinct from v_order.total then raise exception 'Order total changed. Reload before payment.'; end if;
  if not exists(select 1 from pos_order_items where order_id=p_order_id) then raise exception 'Order has no items'; end if;
  if coalesce(v_order.refunded_amount_lyd,0)<>0 then raise exception 'Order requires manager review'; end if;
  perform 1 from pos_shifts where id=p_shift_id and branch_id=p_branch_id and status='open' for update;
  if not found then raise exception 'An open shift for this branch is required'; end if;
  if p_payment_method is null or p_payment_method not in ('cash','card','split') then raise exception 'Choose cash, card or split payment'; end if;
  v_card:=case when p_payment_method='card' then v_order.total when p_payment_method='cash' then 0 else p_card_amount end;
  if v_card is null or v_card::text in ('NaN','Infinity','-Infinity') or v_card<0 or v_card>v_order.total
    or (p_payment_method='split' and (v_card<=0 or v_card>=v_order.total)) then raise exception 'Invalid card amount'; end if;
  v_cash:=v_order.total-v_card;
  if p_payment_method in ('cash','split') and (p_cash_tendered is null
    or p_cash_tendered::text in ('NaN','Infinity','-Infinity') or p_cash_tendered<v_cash) then
    raise exception 'Cash received is below the amount due';
  end if;
  v_change:=case when p_payment_method='card' then 0 else p_cash_tendered-v_cash end;
  insert into pos_online_payments(order_id,branch_id,shift_id,actor_profile_id,payment_method,total,cash_tendered,card_amount,change_due)
    values(p_order_id,p_branch_id,p_shift_id,v_actor,p_payment_method,v_order.total,
      case when p_payment_method='card' then null else p_cash_tendered end,v_card,v_change);
  update pos_orders set shift_id=p_shift_id,served_by=v_actor,payment_method=p_payment_method,
    cash_tendered=case when p_payment_method='card' then null else p_cash_tendered end,
    card_amount=v_card,change_due=v_change,status='completed',awaiting_staff_confirm=false
    where id=p_order_id returning * into v_order;
  -- Existing order triggers write tender and loyalty events and consume stock.
  -- If any fails, payment proof, order state and all effects roll back together.
  update pos_shifts set total_sales=coalesce(total_sales,0)+v_order.total,total_orders=coalesce(total_orders,0)+1,
    total_cash_sales=coalesce(total_cash_sales,0)+v_cash,total_card_sales=coalesce(total_card_sales,0)+v_card,
    total_discounts=coalesce(total_discounts,0)+coalesce(v_order.discount_amount,0),expected_cash=coalesce(expected_cash,0)+v_cash
    where id=p_shift_id;
  update pos_shift_attendees set total_sales=coalesce(total_sales,0)+v_order.total,total_orders=coalesce(total_orders,0)+1
    where shift_id=p_shift_id and user_id=v_actor;
  return jsonb_build_object('success',true,'already_completed',false,'print_ticket',not v_preparing,'order',to_jsonb(v_order));
end $$;
revoke all on function public.complete_online_order_payment(uuid,uuid,uuid,numeric,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.complete_online_order_payment(uuid,uuid,uuid,numeric,text,numeric,numeric) to authenticated;
commit;
