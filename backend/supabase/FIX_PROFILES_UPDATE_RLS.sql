-- Allow owners to UPDATE any profile row (matches the INSERT policy you already added).
-- Without this, the owner can only edit their own row; editing staff rows silently fails.

DROP POLICY IF EXISTS "owner can update any profile" ON profiles;

CREATE POLICY "owner can update any profile"
ON profiles FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
);
