-- Both installed indexes cover precisely the same product_id column.
-- Retain the canonical index; remove only a proven redundant nonunique copy.
-- Abort quickly rather than waiting on an active sale or blocking opening.
begin;
set local lock_timeout='1s';
set local statement_timeout='10s';
do $migration$
begin
  if exists (
    select 1 from pg_index redundant
    join pg_class r on r.oid=redundant.indexrelid
    join pg_index canonical on canonical.indrelid=redundant.indrelid
    join pg_class c on c.oid=canonical.indexrelid
    where r.oid=to_regclass('public.idx_pos_order_items_product')
      and c.oid=to_regclass('public.idx_pos_order_items_product_id')
      and redundant.indrelid='public.pos_order_items'::regclass
      and canonical.indisvalid and canonical.indisready
      and not redundant.indisunique and not canonical.indisunique
      and redundant.indnatts=1 and canonical.indnatts=1
      and redundant.indkey=canonical.indkey
      and redundant.indclass=canonical.indclass
      and redundant.indcollation=canonical.indcollation
      and redundant.indoption=canonical.indoption
      and r.relam=c.relam and r.reloptions is not distinct from c.reloptions
      and redundant.indpred is null and canonical.indpred is null
      and redundant.indexprs is null and canonical.indexprs is null
      and not exists(select 1 from pg_constraint k where k.conindid=r.oid)
  ) then
    execute 'drop index public.idx_pos_order_items_product';
  end if;
end $migration$;
commit;
