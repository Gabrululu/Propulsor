CREATE TABLE public.zk_proof_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  proof_type         text NOT NULL DEFAULT 'consistent_saving',
  status             text NOT NULL DEFAULT 'queued',
  months_with_saving integer,
  threshold_months   integer,
  proof_hash         text,
  tx_hash            text,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.zk_proof_jobs TO authenticated;
GRANT ALL ON public.zk_proof_jobs TO service_role;

ALTER TABLE public.zk_proof_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.zk_proof_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own proof jobs"
  ON public.zk_proof_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.zk_proof_jobs;