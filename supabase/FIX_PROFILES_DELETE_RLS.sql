-- Allow owners to DELETE any profile row (matches the UPDATE policy fix in
-- FIX_PROFILES_UPDATE_RLS.sql). The original schema.sql policy used a scalar
-- subquery `(select role from profiles where id = auth.uid()) = 'owner'`
-- which evaluates to NULL inside RLS in some setups → Postgres deletes 0 rows
-- with no error → the UI thinks the delete worked, but the row reappears on
-- refresh.

DROP POLICY IF EXISTS "profiles_delete" ON profiles;

CREATE POLICY "profiles_delete"
ON profiles FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
);
