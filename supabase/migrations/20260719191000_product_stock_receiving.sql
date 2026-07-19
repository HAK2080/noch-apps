-- One audited product-stock receiving path for POS and Telegram.
-- This migration is additive and is intentionally not applied by local work.

alter table public.pos_inventory_movements
  add column if not exists actor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists source text not null default 'pos',
  add column if not exists source_ref text;

create unique index if not exists pos_inventory_movements_source_ref_uidx
  on public.pos_inventory_movements(source, source_ref)
  where source_ref is not null;

create table if not exists public.telegram_stock_sessions (
  telegram_chat_id text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.pos_branches(id) on delete cascade,
  language text not null default 'ar' check (language in ('ar', 'en')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_stock_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id text not null,
  telegram_message_id text not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  branch_id uuid not null references public.pos_branches(id) on delete restrict,
  product_id uuid references public.pos_products(id) on delete restrict,
  candidate_product_ids uuid[] not null default '{}',
  quantity numeric(10,2) not null check (quantity > 0),
  language text not null default 'ar' check (language in ('ar', 'en')),
  status text not null default 'pending'
    check (status in ('selecting', 'pending', 'applied', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (telegram_chat_id, telegram_message_id)
);

create index if not exists telegram_stock_requests_pending_idx
  on public.telegram_stock_requests(telegram_chat_id, created_at desc)
  where status in ('selecting', 'pending');

alter table public.telegram_stock_sessions enable row level security;
alter table public.telegram_stock_requests enable row level security;

revoke all on public.telegram_stock_sessions from public, anon, authenticated;
revoke all on public.telegram_stock_requests from public, anon, authenticated;
grant all on public.telegram_stock_sessions to service_role;
grant all on public.telegram_stock_requests to service_role;

create or replace function public.receive_pos_product_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_source text default 'pos',
  p_source_ref text default null,
  p_actor_profile_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_product public.pos_products;
  v_existing public.pos_inventory_movements;
  v_actor uuid;
  v_new_qty numeric(10,2);
  v_movement_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero';
  end if;
  if p_source not in ('pos', 'telegram') then
    raise exception 'Invalid stock source';
  end if;

  v_actor := coalesce(p_actor_profile_id, auth.uid());

  select * into v_product
  from public.pos_products
  where id = p_product_id and is_active = true
  for update;

  if not found then
    raise exception 'Product not found or inactive';
  end if;

  if p_source = 'telegram' then
    if auth.role() <> 'service_role' then
      raise exception 'Telegram stock updates require the service role';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = v_actor
        and p.is_active is true
        and p.branch_id = v_product.branch_id
    ) then
      raise exception 'Employee is not active at this branch';
    end if;
  elsif not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active is true
      and (
        p.role in ('owner', 'supervisor')
        or p.branch_id = v_product.branch_id
        or exists (
          select 1 from public.staff_branches sb
          where sb.user_id = p.id and sb.branch_id = v_product.branch_id
        )
      )
  ) then
    raise exception 'You cannot receive stock for this branch';
  end if;

  if p_actor_profile_id is not null and not exists (
    select 1 from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.is_active is true
      and (
        actor.role in ('owner', 'supervisor')
        or actor.branch_id = v_product.branch_id
        or exists (
          select 1 from public.staff_branches actor_branch
          where actor_branch.user_id = actor.id
            and actor_branch.branch_id = v_product.branch_id
        )
      )
  ) then
    raise exception 'Stock reporter is not active at this branch';
  end if;

  if p_source_ref is not null then
    select * into v_existing
    from public.pos_inventory_movements
    where source = p_source and source_ref = p_source_ref
    limit 1;

    if found then
      return jsonb_build_object(
        'movement_id', v_existing.id,
        'product_id', v_product.id,
        'branch_id', v_product.branch_id,
        'stock_before', v_existing.stock_before,
        'stock_after', v_existing.stock_after,
        'quantity_received', v_existing.quantity,
        'duplicate', true
      );
    end if;
  end if;

  v_new_qty := round((coalesce(v_product.stock_qty, 0) + p_quantity)::numeric, 2);

  update public.pos_products
  set stock_qty = v_new_qty,
      track_inventory = true,
      updated_at = now()
  where id = v_product.id;

  insert into public.pos_inventory_movements (
    branch_id, product_id, movement_type, quantity,
    stock_before, stock_after, notes,
    actor_profile_id, source, source_ref
  ) values (
    v_product.branch_id, v_product.id, 'restock', round(p_quantity::numeric, 2),
    coalesce(v_product.stock_qty, 0), v_new_qty, 'Product stock received',
    v_actor, p_source, nullif(p_source_ref, '')
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'product_id', v_product.id,
    'branch_id', v_product.branch_id,
    'product_name', v_product.name,
    'product_name_ar', v_product.name_ar,
    'stock_before', coalesce(v_product.stock_qty, 0),
    'stock_after', v_new_qty,
    'quantity_received', round(p_quantity::numeric, 2),
    'duplicate', false
  );
exception
  when unique_violation then
    select * into v_existing
    from public.pos_inventory_movements
    where source = p_source and source_ref = p_source_ref
    limit 1;
    return jsonb_build_object(
      'movement_id', v_existing.id,
      'product_id', v_existing.product_id,
      'branch_id', v_existing.branch_id,
      'stock_before', v_existing.stock_before,
      'stock_after', v_existing.stock_after,
      'quantity_received', v_existing.quantity,
      'duplicate', true
    );
end;
$function$;

revoke all on function public.receive_pos_product_stock(uuid, numeric, text, text, uuid) from public, anon;
grant execute on function public.receive_pos_product_stock(uuid, numeric, text, text, uuid)
  to authenticated, service_role;
