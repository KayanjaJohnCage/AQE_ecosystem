-- Registration/profile nationality and controlled account-identity change timestamp.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS identity_last_changed_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_nationality_idx ON public.profiles(nationality);
