begin;

-- Preserve the cost used when an order becomes a paid sale. Historical rows
-- remain NULL rather than being silently backfilled from today's product cost.
alter table public.pos_order_items
  add column if not exists unit_cost_lyd_at_sale numeric(14,3),
  add column if not exists cost_snapshot_at timestamptz;
alter table public.pos_order_item_modifiers
  add column if not exists cost_delta_lyd_at_sale numeric(14,3),
  add column if not exists cost_snapshot_at timestamptz;

comment on column public.pos_order_items.unit_cost_lyd_at_sale is
  'Product unit cost captured for this sale; NULL on unverified historical or uncosted items.';
comment on column public.pos_order_items.cost_snapshot_at is
  'Time the order-item unit cost was captured or refreshed at first payment.';
comment on column public.pos_order_item_modifiers.cost_delta_lyd_at_sale is
  'Modifier unit cost captured for this sale; NULL on unverified historical or uncosted modifiers.';

create or replace function public.pos_capture_item_cost_at_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_cost numeric(14,3);
begin
  if new.product_id is null then return new; end if;
  select cost_lyd into v_cost from public.pos_products where id=new.product_id;
  if found then
    new.unit_cost_lyd_at_sale:=v_cost;
    new.cost_snapshot_at:=now();
  end if;
  return new;
end $$;

drop trigger if exists pos_item_cost_at_insert on public.pos_order_items;
create trigger pos_item_cost_at_insert
before insert on public.pos_order_items for each row
execute function public.pos_capture_item_cost_at_insert();

create or replace function public.pos_capture_modifier_cost_at_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_cost numeric(14,3);
begin
  if new.modifier_id is null then return new; end if;
  select cost_delta_lyd into v_cost from public.pos_modifiers where id=new.modifier_id;
  if found then
    new.cost_delta_lyd_at_sale:=v_cost;
    new.cost_snapshot_at:=now();
  end if;
  return new;
end $$;

drop trigger if exists pos_modifier_cost_at_insert on public.pos_order_item_modifiers;
create trigger pos_modifier_cost_at_insert
before insert on public.pos_order_item_modifiers for each row
execute function public.pos_capture_modifier_cost_at_insert();

-- Customer orders can be entered before payment. Refresh their initially
-- provisional cost when the pending order is first completed/paid. Direct POS
-- orders insert as completed and are covered by the item-insert trigger.
create or replace function public.pos_refresh_item_cost_at_first_payment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status is distinct from 'completed' and new.status='completed' then
    update public.pos_order_items item
       set unit_cost_lyd_at_sale=product.cost_lyd,
           cost_snapshot_at=now()
      from public.pos_products product
     where item.order_id=new.id and product.id=item.product_id;
    update public.pos_order_item_modifiers selected
       set cost_delta_lyd_at_sale=modifier.cost_delta_lyd,
           cost_snapshot_at=now()
      from public.pos_modifiers modifier, public.pos_order_items item
     where selected.order_item_id=item.id and item.order_id=new.id
       and modifier.id=selected.modifier_id;
  end if;
  return new;
end $$;

drop trigger if exists pos_item_cost_at_first_payment on public.pos_orders;
create trigger pos_item_cost_at_first_payment
after update of status on public.pos_orders for each row
when (old.status is distinct from 'completed' and new.status='completed')
execute function public.pos_refresh_item_cost_at_first_payment();

-- Staff can still edit order-item quantities and notes through existing flows,
-- but cannot rewrite a paid order's captured cost. The nested first-payment
-- trigger above is the sole authorized refresh of that field.
create or replace function public.pos_guard_paid_item_cost_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.unit_cost_lyd_at_sale is distinct from old.unit_cost_lyd_at_sale
      or new.cost_snapshot_at is distinct from old.cost_snapshot_at)
     and pg_trigger_depth() < 2
     and exists(select 1 from public.pos_orders o where o.id=new.order_id
       and o.status in ('completed','voided')) then
    raise exception 'paid order cost snapshot cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists pos_guard_paid_item_cost_snapshot on public.pos_order_items;
create trigger pos_guard_paid_item_cost_snapshot
before update on public.pos_order_items for each row
execute function public.pos_guard_paid_item_cost_snapshot();

create or replace function public.pos_guard_paid_modifier_cost_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.cost_delta_lyd_at_sale is distinct from old.cost_delta_lyd_at_sale
      or new.cost_snapshot_at is distinct from old.cost_snapshot_at)
     and pg_trigger_depth() < 2
     and exists(select 1 from public.pos_order_items item
       join public.pos_orders o on o.id=item.order_id
       where item.id=new.order_item_id and o.status in ('completed','voided')) then
    raise exception 'paid order modifier cost snapshot cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists pos_guard_paid_modifier_cost_snapshot on public.pos_order_item_modifiers;
create trigger pos_guard_paid_modifier_cost_snapshot
before update on public.pos_order_item_modifiers for each row
execute function public.pos_guard_paid_modifier_cost_snapshot();

commit;
