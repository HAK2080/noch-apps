-- Source tables gained columns after their archive tables were created.
-- Add nullable archive columns without rewriting historical snapshots.
do $migration$
declare
  source_name text;
  col record;
begin
  foreach source_name in array array['pos_orders','pos_order_items','pos_products','pos_categories','loyalty_customers'] loop
    -- Archives are for database recovery, not the public Data API. Protect
    -- customer/sale snapshots before adding any newly introduced fields.
    execute format('alter table public.%I enable row level security', source_name || '_archive');
    execute format('revoke all on public.%I from anon, authenticated', source_name || '_archive');
    for col in
      select a.attname, format_type(a.atttypid, a.atttypmod) as sql_type
      from pg_attribute a
      where a.attrelid = format('public.%I', source_name)::regclass
        and a.attnum > 0 and not a.attisdropped
        and not exists (select 1 from pg_attribute b
          where b.attrelid = format('public.%I', source_name || '_archive')::regclass
            and b.attname = a.attname and b.attnum > 0 and not b.attisdropped)
      order by a.attnum
    loop
      execute format('alter table public.%I add column %I %s', source_name || '_archive', col.attname, col.sql_type);
    end loop;
  end loop;
end $migration$;

create or replace function public.take_daily_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  snapshot_day date := current_date;
  source_name text;
  columns_sql text;
  copied int;
  result jsonb := jsonb_build_object('snapshot_date', snapshot_day);
begin
  perform pg_advisory_xact_lock(hashtext('noch-daily-snapshot'));
  -- Check every table before doing any copies, so future schema drift fails
  -- cheaply rather than writing thousands of rows and rolling them back.
  foreach source_name in array array['pos_orders','pos_order_items','pos_products','pos_categories','loyalty_customers'] loop
    if exists (
      select 1 from pg_attribute a
      where a.attrelid = format('public.%I', source_name)::regclass
        and a.attnum > 0 and not a.attisdropped
        and not exists (select 1 from pg_attribute b
          where b.attrelid = format('public.%I', source_name || '_archive')::regclass
            and b.attname = a.attname and b.atttypid = a.atttypid
            and b.atttypmod = a.atttypmod and b.attnum > 0 and not b.attisdropped)
    ) then
      raise exception 'Archive schema mismatch for %; align archive columns before snapshot', source_name;
    end if;
  end loop;

  foreach source_name in array array['pos_orders','pos_order_items','pos_products','pos_categories','loyalty_customers'] loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into columns_sql
    from pg_attribute where attrelid = format('public.%I', source_name)::regclass
      and attnum > 0 and not attisdropped;
    execute format('delete from public.%I where snapshot_date = $1', source_name || '_archive') using snapshot_day;
    execute format('insert into public.%I (snapshot_date, archived_at, %s) select $1, now(), %s from public.%I',
      source_name || '_archive', columns_sql, columns_sql, source_name) using snapshot_day;
    get diagnostics copied = row_count;
    result := result || jsonb_build_object(case source_name
      when 'pos_orders' then 'orders' when 'pos_order_items' then 'order_items'
      when 'pos_products' then 'products' when 'pos_categories' then 'categories'
      else 'customers' end, copied);
    -- Keep the existing 30-day retention policy.
    execute format('delete from public.%I where snapshot_date < $1 - interval ''30 days''', source_name || '_archive') using snapshot_day;
  end loop;
  return result;
end $function$;
-- The scheduler runs as postgres. Public clients must not trigger full
-- database copies through this SECURITY DEFINER function.
revoke execute on function public.take_daily_snapshot() from public, anon, authenticated;
grant execute on function public.take_daily_snapshot() to service_role;
-- Deployment only aligns schemas and replaces the function. The existing
-- daily scheduler performs the next snapshot; no snapshot/purge runs here.
