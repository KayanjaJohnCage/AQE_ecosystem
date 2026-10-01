-- Store the member timezone used by the customer profile and settings editor.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text;

CREATE INDEX IF NOT EXISTS profiles_timezone_idx ON public.profiles(timezone);
