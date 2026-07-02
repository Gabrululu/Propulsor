
CREATE OR REPLACE FUNCTION public.get_own_stellar_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT stellar_secret_encrypted
  FROM public.users_profile
  WHERE id = auth.uid()
$function$;

REVOKE ALL ON FUNCTION public.get_own_stellar_secret() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_stellar_secret() TO authenticated;
