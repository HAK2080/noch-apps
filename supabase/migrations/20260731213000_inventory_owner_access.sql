-- Owner profiles are outside the employee active/inactive lifecycle in this
-- production dataset. Preserve owner authority while continuing to require an
-- active profile for supervisors and branch staff.

drop policy if exists "inventory_location_stock_owner_write"
  on public.inventory_location_stock;
create policy "inventory_location_stock_owner_write"
  on public.inventory_location_stock
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and (
          p.role = 'owner'
          or (p.role = 'supervisor' and coalesce(p.is_active, true))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and (
          p.role = 'owner'
          or (p.role = 'supervisor' and coalesce(p.is_active, true))
        )
    )
  );

do $migration$
declare
  v_routine regprocedure;
  v_definition text;
begin
  foreach v_routine in array array[
    'public.record_inventory_location_count(uuid,uuid,numeric,text,text)'::regprocedure,
    'public.receive_branch_product_stock(uuid,uuid,numeric,text,text,uuid)'::regprocedure,
    'public.adjust_pos_product_stock(uuid,uuid,numeric,text)'::regprocedure,
    'public.receive_warehouse_stock(uuid,numeric,text)'::regprocedure,
    'public.receive_transfer(uuid,numeric,text)'::regprocedure,
    'public.report_waste(uuid,uuid,numeric,text,text)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_routine);
    v_definition := replace(
      v_definition,
      'and coalesce(p.is_active, true)',
      'and (p.role = ''owner'' or coalesce(p.is_active, true))'
    );
    v_definition := replace(
      v_definition,
      'where id = p_actor_profile_id and coalesce(is_active, true)',
      'where id = p_actor_profile_id and (role = ''owner'' or coalesce(is_active, true))'
    );
    execute v_definition;
  end loop;
end;
$migration$;

