-- pgcrypto lives in extensions; these SECURITY DEFINER functions intentionally
-- use search_path=public. Qualify crypto calls, keeping the installed function
-- bodies, ownership, privileges and search paths otherwise exactly as they are.
do $repair_loyalty_checkout_crypto$
declare
  signature text;
  function_oid oid;
  before_definition text;
  after_definition text;
  before_security jsonb;
  after_security jsonb;
begin
  if to_regprocedure('extensions.gen_random_bytes(integer)') is null
     or to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'Expected pgcrypto functions in extensions; no changes applied';
  end if;

  foreach signature in array array[
    'public.create_loyalty_checkout_v2(uuid,uuid)',
    'public.claim_loyalty_checkout_v2(text)',
    'public.get_my_loyalty_checkout_v2(text)'
  ] loop
    function_oid := to_regprocedure(signature);
    if function_oid is null then
      raise exception 'Required loyalty checkout function missing: %', signature;
    end if;
    select pg_get_functiondef(p.oid),
           jsonb_build_object('owner', p.proowner, 'acl', p.proacl,
             'definer', p.prosecdef, 'settings', p.proconfig,
             'volatility', p.provolatile, 'arguments', p.proargnames)
      into before_definition, before_security
      from pg_proc p where p.oid = function_oid;

    after_definition := regexp_replace(before_definition,
      '(^|[^[:alnum:]_.])gen_random_bytes[[:space:]]*\(',
      '\1extensions.gen_random_bytes(', 'gi');
    after_definition := regexp_replace(after_definition,
      '(^|[^[:alnum:]_.])digest[[:space:]]*\(',
      '\1extensions.digest(', 'gi');
    if after_definition is distinct from before_definition then
      execute after_definition;
    end if;

    select jsonb_build_object('owner', p.proowner, 'acl', p.proacl,
             'definer', p.prosecdef, 'settings', p.proconfig,
             'volatility', p.provolatile, 'arguments', p.proargnames)
      into after_security from pg_proc p where p.oid = function_oid;
    if after_security is distinct from before_security then
      raise exception 'Unexpected loyalty security metadata change: %', signature;
    end if;
  end loop;
end;
$repair_loyalty_checkout_crypto$;

notify pgrst, 'reload schema';
