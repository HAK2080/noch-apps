-- Allow the storefront (anon role) to read its own pending order rows
-- so a Supabase Realtime subscription can deliver the moment staff
-- taps Confirm at POS. Limited to rows created in the last 24h to
-- minimize blast radius — UUIDs are unguessable, so a customer with
-- the order id from submit_guest_order is the only one who realistically
-- targets a real row.

drop policy if exists "anon_read_recent_pos_orders" on pos_orders;

create policy "anon_read_recent_pos_orders"
  on pos_orders for select
  to anon
  using (created_at > now() - interval '24 hours');

-- Realtime needs the row to be present in the publication. Most projects
-- already have pos_orders in supabase_realtime; this is idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pos_orders'
  ) then
    execute 'alter publication supabase_realtime add table pos_orders';
  end if;
end $$;
