-- Enable Presto payment collection only for selected POS branches.
-- All existing branches stay disabled until an owner switches this on in
-- POS Settings. The trigger protects the rule for direct and offline RPC use.

alter table public.pos_settings
  add column if not exists presto_enabled boolean not null default false;

create or replace function public.enforce_presto_branch_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_presto_enabled boolean := false;
begin
  if new.payment_method <> 'presto' then
    return new;
  end if;

  select coalesce(presto_enabled, false)
    into v_presto_enabled
    from public.pos_settings
   where branch_id = new.branch_id;

  if not coalesce(v_presto_enabled, false) then
    raise exception 'Presto payments are not enabled for this branch';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_presto_branch_setting() from public;

create trigger enforce_presto_branch_setting
  before insert on public.pos_orders
  for each row execute function public.enforce_presto_branch_setting();
