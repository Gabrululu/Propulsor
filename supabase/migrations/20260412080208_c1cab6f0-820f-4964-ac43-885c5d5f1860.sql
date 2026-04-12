
-- 1. Revoke direct column access to stellar_secret_encrypted
--    Replace the broad SELECT policy with one that excludes sensitive columns
--    Unfortunately Postgres RLS is row-level not column-level, so we use a security definer function instead

-- Create a security definer function to retrieve the encrypted secret only for the owner
CREATE OR REPLACE FUNCTION public.get_own_stellar_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT stellar_secret_encrypted
  FROM public.users_profile
  WHERE id = auth.uid()
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_own_stellar_secret() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_own_stellar_secret() FROM anon, public;
