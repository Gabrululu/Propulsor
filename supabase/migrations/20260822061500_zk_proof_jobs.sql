-- Table: zk_proof_jobs
-- Tracks async Proof-of-Consistent-Saving generation jobs. Generation runs on
-- a GitHub Actions runner (RISC Zero's Groth16 step needs Docker, which
-- Railway does not allow) — this table is how that job reports status back
-- to the dashboard. One row per generation attempt.
CREATE TABLE public.zk_proof_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  proof_type         text NOT NULL DEFAULT 'consistent_saving',
  status             text NOT NULL DEFAULT 'queued', -- queued | done | not_qualified | error
  months_with_saving integer,
  threshold_months   integer,
  proof_hash         text,
  tx_hash            text,
  error_message      text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE public.zk_proof_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.zk_proof_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own proof jobs"
  ON public.zk_proof_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert proof jobs"
  ON public.zk_proof_jobs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update proof jobs"
  ON public.zk_proof_jobs FOR UPDATE
  TO service_role
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.zk_proof_jobs;
