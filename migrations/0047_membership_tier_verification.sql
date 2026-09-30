-- Membership verification is payment-backed. A newly registered independent profile
-- starts on Basic but remains pending until the manager confirms its membership payment.
-- The trigger complements the existing atomic payment RPC without replacing it.

CREATE OR REPLACE FUNCTION public.apply_membership_payment_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_kind text;
  requested_tier text;
BEGIN
  IF NEW.status <> 'confirmed' OR COALESCE(OLD.status, '') = 'confirmed' THEN
    RETURN NEW;
  END IF;

  payment_kind := lower(COALESCE(NEW.metadata->>'paymentKind', NEW.metadata->>'payment_kind', ''));
  requested_tier := lower(COALESCE(NEW.metadata->>'requestedTier', NEW.metadata->>'requested_tier', ''));

  IF payment_kind IN ('membership_upgrade', 'subscription_renewal')
     AND requested_tier IN ('basic', 'premium', 'vip') THEN
    UPDATE public.profiles
    SET
      tier = requested_tier,
      verification_status = 'approved',
      updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_orders_membership_verification
  ON public.payment_orders;

CREATE TRIGGER payment_orders_membership_verification
AFTER UPDATE OF status ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.apply_membership_payment_verification();

GRANT EXECUTE ON FUNCTION public.apply_membership_payment_verification() TO service_role;