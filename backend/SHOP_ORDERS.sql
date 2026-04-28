-- SHOP_ORDERS.sql
-- Online shop order tables + customer-facing RPC.
-- Idempotent. Run via Supabase SQL Editor or Management API.

-- ── Tables ───────────────────────────────────────────────────────────
create table if not exists public.shop_orders (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  customer_name     text not null,
  customer_phone    text not null,
  customer_city     text not null,
  delivery_method   text not null check (delivery_method in ('pickup','shipping')),
  delivery_address  text,
  subtotal_lyd      numeric(12,2) not null default 0,
  total_lyd         numeric(12,2) not null default 0,
  notes             text,
  status            text not null default 'new'
                      check (status in ('new','confirmed','preparing','ready','shipped','delivered','cancelled')),
  whatsapp_sent_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_shop_orders_status on public.shop_orders(status, created_at desc);
create index if not exists idx_shop_orders_phone  on public.shop_orders(customer_phone);

create table if not exists public.shop_order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.shop_orders(id) on delete cascade,
  product_id      uuid not null references public.pos_products(id),
  product_name    text not null,
  product_name_ar text,
  qty             int not null check (qty > 0),
  unit_price_lyd  numeric(12,2) not null,
  line_total_lyd  numeric(12,2) not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_shop_order_items_order on public.shop_order_items(order_id);

alter table public.shop_orders      enable row level security;
alter table public.shop_order_items enable row level security;

drop policy if exists "shop_orders authenticated full" on public.shop_orders;
create policy "shop_orders authenticated full"
  on public.shop_orders for all to authenticated using (true) with check (true);

drop policy if exists "shop_order_items authenticated full" on public.shop_order_items;
create policy "shop_order_items authenticated full"
  on public.shop_order_items for all to authenticated using (true) with check (true);

-- ── Public RPC: place_shop_order ─────────────────────────────────────
-- Anon-callable. Validates payload, generates a NOCH44XXXX code, inserts
-- the order + items in a single transaction, queues two WhatsApp messages
-- (one to customer, one to staff), and returns { code, total, items }.
create or replace function public.place_shop_order(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql
as $$
declare
  v_code      text;
  v_order_id  uuid;
  v_subtotal  numeric(12,2) := 0;
  v_total     numeric(12,2);
  v_attempts  int := 0;
  v_item      jsonb;
  v_product   pos_products%rowtype;
  v_qty       int;
  v_line      numeric(12,2);
  v_summary   text := '';
  v_first_name text;
  v_method    text;
  v_address   text;
  v_phone     text;
  v_city      text;
  v_name      text;
  v_notes     text;
  v_items     jsonb;
  v_chars     text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- skip ambiguous I O 0 1
  v_staff_phone text := '+218946987558';
begin
  -- ── Validate ────────────────────────────────────────────────
  v_name   := nullif(trim(p_payload->>'name'), '');
  v_phone  := nullif(trim(p_payload->>'phone'), '');
  v_city   := nullif(trim(p_payload->>'city'), '');
  v_method := nullif(trim(p_payload->>'delivery_method'), '');
  v_address:= nullif(trim(p_payload->>'delivery_address'), '');
  v_notes  := nullif(trim(p_payload->>'notes'), '');
  v_items  := p_payload->'items';

  if v_name is null  then raise exception 'NAME_REQUIRED'  using errcode='22023'; end if;
  if v_phone is null then raise exception 'PHONE_REQUIRED' using errcode='22023'; end if;
  if v_city is null  then raise exception 'CITY_REQUIRED'  using errcode='22023'; end if;
  if v_method is null or v_method not in ('pickup','shipping') then
    raise exception 'METHOD_INVALID' using errcode='22023';
  end if;
  if v_method = 'shipping' and v_address is null then
    raise exception 'ADDRESS_REQUIRED' using errcode='22023';
  end if;
  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'EMPTY_CART' using errcode='22023';
  end if;

  -- ── Generate unique code ───────────────────────────────────
  loop
    v_attempts := v_attempts + 1;
    v_code := 'NOCH44' ||
      substr(v_chars, floor(random()*length(v_chars))::int+1, 1) ||
      substr(v_chars, floor(random()*length(v_chars))::int+1, 1) ||
      substr(v_chars, floor(random()*length(v_chars))::int+1, 1) ||
      substr(v_chars, floor(random()*length(v_chars))::int+1, 1);
    exit when not exists (select 1 from shop_orders where code = v_code);
    if v_attempts > 12 then raise exception 'CODE_GENERATION_FAILED'; end if;
  end loop;

  -- ── Create order shell ─────────────────────────────────────
  insert into shop_orders (code, customer_name, customer_phone, customer_city,
                           delivery_method, delivery_address, notes,
                           subtotal_lyd, total_lyd)
  values (v_code, v_name, v_phone, v_city, v_method, v_address, v_notes, 0, 0)
  returning id into v_order_id;

  -- ── Insert items, fetching authoritative price from pos_products ──
  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select * into v_product from pos_products
      where id = (v_item->>'product_id')::uuid
        and visible_on_website = true
        and is_active = true
      limit 1;
    if not found then continue; end if;
    v_line := v_product.price * v_qty;
    v_subtotal := v_subtotal + v_line;
    insert into shop_order_items
      (order_id, product_id, product_name, product_name_ar, qty, unit_price_lyd, line_total_lyd)
    values
      (v_order_id, v_product.id, v_product.name, v_product.name_ar, v_qty, v_product.price, v_line);
    v_summary := v_summary || E'\n• ' || v_qty || ' × ' || v_product.name;
  end loop;

  if v_subtotal = 0 then
    raise exception 'NO_VALID_ITEMS' using errcode='22023';
  end if;

  v_total := v_subtotal;  -- shipping is COD via courier; not charged here
  update shop_orders set subtotal_lyd = v_subtotal, total_lyd = v_total
    where id = v_order_id;

  -- ── Queue WhatsApp messages (uses loyalty_queue_message helper) ──
  v_first_name := coalesce(nullif(split_part(v_name, ' ', 1), ''), 'friend');

  begin
    -- Customer confirmation
    perform public.loyalty_queue_message(
      null,                                     -- no customer_id (anon)
      'whatsapp',
      v_phone,
      E'🎉 Order received, ' || v_first_name || E'!\n\n' ||
      E'Code: *' || v_code || E'*\n' ||
      E'Total: *' || v_total::text || E' LYD*' ||
      case v_method
        when 'pickup' then E'\n📍 Pick up at Noch — City Walk, Hay Al-Andalus'
        else E'\n🚚 Shipping via local courier (cash on delivery)'
      end ||
      v_summary ||
      E'\n\nWe''ll WhatsApp you to confirm shortly. Thanks for shopping with Nochi! 🐇',
      'shop_order',
      jsonb_build_object('code', v_code, 'order_id', v_order_id, 'role', 'customer'),
      interval '5 minutes'
    );
    -- Staff notification
    perform public.loyalty_queue_message(
      null,
      'whatsapp',
      v_staff_phone,
      E'🛒 NEW SHOP ORDER\n\n' ||
      E'Code: *' || v_code || E'*\n' ||
      E'Customer: ' || v_name || E'\n' ||
      E'Phone: ' || v_phone || E'\n' ||
      E'City: ' || v_city || E'\n' ||
      E'Method: ' || (case v_method when 'pickup' then 'PICKUP' else 'SHIPPING' end) ||
      case when v_address is not null then E'\nAddress: ' || v_address else '' end ||
      v_summary ||
      E'\n\nTotal: ' || v_total::text || E' LYD' ||
      case when v_notes is not null then E'\nNotes: ' || v_notes else '' end,
      'shop_order',
      jsonb_build_object('code', v_code, 'order_id', v_order_id, 'role', 'staff'),
      interval '1 minute'
    );
  exception when undefined_function then null;  -- LOYALTY_REMINDERS not yet applied
  end;

  -- shop_orders.loyalty_queue_message uses customer_id NOT NULL constraint;
  -- since this is anon-shop, we patched the helper not to need customer_id.
  -- (See note in LOYALTY_REMINDERS — both arms use customer_id which IS nullable on outbox.)

  -- ── Return summary ─────────────────────────────────────────
  return jsonb_build_object(
    'code', v_code,
    'order_id', v_order_id,
    'subtotal_lyd', v_subtotal,
    'total_lyd', v_total,
    'delivery_method', v_method
  );
end;
$$;

grant execute on function public.place_shop_order(jsonb) to anon, authenticated;

-- Also need a public read-by-code RPC so the customer can re-view their order
create or replace function public.get_shop_order_by_code(p_code text)
returns jsonb
security definer
set search_path = public
language plpgsql
as $$
declare
  v_order shop_orders%rowtype;
  v_items jsonb;
begin
  select * into v_order from shop_orders where code = upper(p_code) limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name', product_name, 'product_name_ar', product_name_ar,
    'qty', qty, 'unit_price_lyd', unit_price_lyd, 'line_total_lyd', line_total_lyd
  )), '[]'::jsonb) into v_items
    from shop_order_items where order_id = v_order.id;
  return jsonb_build_object(
    'found', true,
    'order', to_jsonb(v_order),
    'items', v_items
  );
end;
$$;

grant execute on function public.get_shop_order_by_code(text) to anon, authenticated;
