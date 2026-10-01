-- Payment order table required by the production payment/manager approval APIs.
-- This migration is intentionally idempotent so it can repair environments where
-- the earlier wallet/referral migration created functions that reference this table
-- but the table itself was never applied.

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'UGX' CHECK (char_length(currency) = 3),
  qc_package_id text NOT NULL,
  reference text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'MukuruPay',
  mode text NOT NULL DEFAULT 'live',
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'pending', 'confirmed', 'rejected', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'live';

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS payment_orders_user_id_idx
  ON public.payment_orders (user_id);

CREATE INDEX IF NOT EXISTS payment_orders_status_created_idx
  ON public.payment_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_orders_reference_idx
  ON public.payment_orders (reference);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_orders_select_own_or_manager
  ON public.payment_orders;

CREATE POLICY payment_orders_select_own_or_manager
  ON public.payment_orders
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_aqe_manager()
  );

DROP POLICY IF EXISTS payment_orders_insert_own
  ON public.payment_orders;

CREATE POLICY payment_orders_insert_own
  ON public.payment_orders
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS payment_orders_update_manager
  ON public.payment_orders;

CREATE POLICY payment_orders_update_manager
  ON public.payment_orders
  FOR UPDATE
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());

-- Keep the timestamp current for manager decisions and other server-side updates.
CREATE OR REPLACE FUNCTION public.touch_payment_order_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_orders_touch_updated_at
  ON public.payment_orders;

CREATE TRIGGER payment_orders_touch_updated_at
BEFORE UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.touch_payment_order_updated_at();

-- The server-side approval function was created by migration 0015.
-- Grant only to the server role; the API performs the manager authorization check.
REVOKE ALL ON TABLE public.payment_orders FROM anon;
REVOKE ALL ON TABLE public.payment_orders FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payment_orders TO service_role;
