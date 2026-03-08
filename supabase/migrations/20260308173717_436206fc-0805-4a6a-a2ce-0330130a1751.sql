
-- Profile types enum
CREATE TYPE public.profile_type AS ENUM ('jefa_hogar', 'emprendedora', 'trabajadora', 'freelancer');

-- Users profile table
CREATE TABLE public.users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  profile_type profile_type,
  stellar_public_key TEXT,
  stellar_secret_encrypted TEXT,
  stellar_funded BOOLEAN DEFAULT false,
  onboarding_complete BOOLEAN DEFAULT false,
  voice_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.users_profile FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.users_profile FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users_profile FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
