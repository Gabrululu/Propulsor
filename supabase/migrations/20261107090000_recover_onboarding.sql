-- Durable onboarding journal. Existing owner-only profile RLS also protects this
-- data. No PIN, secret seed or signed transaction is stored in the journal.
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS split_contract_tx text,
  ADD COLUMN IF NOT EXISTS onboarding_draft jsonb;

ALTER TABLE public.users_profile
  ADD CONSTRAINT onboarding_draft_is_object
  CHECK (onboarding_draft IS NULL OR jsonb_typeof(onboarding_draft) = 'object');

-- Do not mark old profiles incomplete in bulk: their rules must be checked
-- against the configured network first. The application reconciles on access.

-- Serialize journal changes across tabs/devices. A second tab must not replace
-- the hash of a transaction whose outcome has not yet been reconciled.
CREATE OR REPLACE FUNCTION public.save_onboarding_draft(p_user_id uuid, p_draft jsonb, p_expected_hash text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_hash text;
  next_hash text := p_draft->'transaction'->>'hash';
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_draft) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid draft'; END IF;
  INSERT INTO public.users_profile(id) VALUES(auth.uid()) ON CONFLICT (id) DO NOTHING;
  SELECT onboarding_draft->'transaction'->>'hash' INTO current_hash
    FROM public.users_profile WHERE id = auth.uid() FOR UPDATE;
  IF current_hash IS DISTINCT FROM p_expected_hash AND current_hash IS DISTINCT FROM next_hash THEN
    RAISE EXCEPTION 'ONBOARDING_CONFLICT';
  END IF;
  UPDATE public.users_profile SET onboarding_draft = p_draft, onboarding_complete = false
    WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.save_onboarding_draft(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_draft(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_onboarding(p_user_id uuid, p_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  draft jsonb;
  completed boolean;
  completed_hash text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid transaction hash'; END IF;
  SELECT onboarding_draft, onboarding_complete, split_contract_tx INTO draft, completed, completed_hash
    FROM public.users_profile WHERE id = auth.uid() FOR UPDATE;
  IF completed AND completed_hash = p_hash THEN RETURN; END IF;
  IF draft IS NULL OR draft->'transaction'->>'hash' IS DISTINCT FROM p_hash THEN
    RAISE EXCEPTION 'ONBOARDING_CONFLICT';
  END IF;
  UPDATE public.users_profile SET
    name = draft->>'name',
    profile_type = (draft->>'profileType')::public.profile_type,
    stellar_public_key = draft->>'publicKey',
    split_contract_tx = p_hash,
    onboarding_complete = true,
    onboarding_draft = NULL
  WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.complete_onboarding(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(uuid, text) TO authenticated;
