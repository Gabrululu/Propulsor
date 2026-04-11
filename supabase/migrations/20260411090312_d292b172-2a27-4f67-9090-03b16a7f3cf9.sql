
-- Table: agent_activity
CREATE TABLE public.agent_activity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.users_profile(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  amount_usdc     numeric,
  tx_hash         text,
  vault_breakdown jsonb,
  blend_tx_hash   text,
  blend_success   boolean DEFAULT false,
  error_message   text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.agent_activity REPLICA IDENTITY FULL;
ALTER TABLE public.agent_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own activity"
  ON public.agent_activity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert activity"
  ON public.agent_activity FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Table: agent_status
CREATE TABLE public.agent_status (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.users_profile(id) ON DELETE CASCADE UNIQUE,
  is_active       boolean DEFAULT false,
  watched_account text,
  last_heartbeat  timestamptz,
  last_split_at   timestamptz,
  total_splits    integer DEFAULT 0,
  total_yield_usdc numeric DEFAULT 0,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.agent_status REPLICA IDENTITY FULL;
ALTER TABLE public.agent_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own status"
  ON public.agent_status FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage status"
  ON public.agent_status FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_status;
