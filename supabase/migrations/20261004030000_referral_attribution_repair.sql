-- AQE production referral attribution repair.
-- Prevent registrations from losing referral codes/relationships before payment confirmation.

CREATE OR REPLACE FUNCTION public.aqe_ensure_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
    NEW.referral_code := 'AQE-' || upper(substr(md5(NEW.user_id::text), 1, 12));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_ensure_referral_code ON public.profiles;
CREATE TRIGGER profiles_ensure_referral_code
BEFORE INSERT OR UPDATE OF user_id, referral_code ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.aqe_ensure_referral_code();

UPDATE public.profiles
SET referral_code = 'AQE-' || upper(substr(md5(user_id::text), 1, 12))
WHERE referral_code IS NULL OR btrim(referral_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique_idx
ON public.profiles (referral_code)
WHERE referral_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_referred_by_not_self'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_referred_by_not_self
      CHECK (referred_by IS NULL OR referred_by <> user_id);
  END IF;
END
$$;
