-- Add ON DELETE SET NULL to every FK targeting profiles(id) that currently
-- has the default NO ACTION behavior. Without this, deleting a staff
-- profile fails with a foreign key violation whenever any history row
-- (pos_shifts, procurement_orders, etc.) references that staff member.
--
-- Self-discovering: works against the live schema regardless of which
-- migrations have or haven't been applied. Running it twice is a no-op.
--
-- After this runs, deleting a profile will null-out historical references
-- (so reports/audits stay intact) instead of blocking the delete.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      con.conname     AS constraint_name,
      cls.relname     AS table_name,
      att.attname     AS column_name
    FROM pg_constraint con
    JOIN pg_class cls       ON cls.oid = con.conrelid
    JOIN pg_class ref_cls   ON ref_cls.oid = con.confrelid
    JOIN pg_namespace ns    ON ns.oid = cls.relnamespace
    JOIN pg_attribute att   ON att.attrelid = con.conrelid
                           AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND ref_cls.relname = 'profiles'
      AND ns.nspname = 'public'
      AND con.confdeltype = 'a'  -- 'a' = NO ACTION (default)
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      r.table_name, r.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE SET NULL',
      r.table_name, r.constraint_name, r.column_name
    );
    RAISE NOTICE 'Patched % on %(%)', r.constraint_name, r.table_name, r.column_name;
  END LOOP;
END $$;

-- Verification: list all remaining FKs to profiles and their on-delete behavior.
-- Expect every row to show 'SET NULL' (n) or 'CASCADE' (c) — never 'NO ACTION' (a).
SELECT
  cls.relname  AS table_name,
  att.attname  AS column_name,
  con.conname  AS constraint_name,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION (BAD — blocks delete)'
    WHEN 'r' THEN 'RESTRICT (BAD — blocks delete)'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    WHEN 'c' THEN 'CASCADE'
  END AS on_delete
FROM pg_constraint con
JOIN pg_class cls     ON cls.oid = con.conrelid
JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
JOIN pg_namespace ns  ON ns.oid = cls.relnamespace
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
WHERE con.contype = 'f'
  AND ref_cls.relname = 'profiles'
  AND ns.nspname = 'public'
ORDER BY cls.relname, att.attname;
