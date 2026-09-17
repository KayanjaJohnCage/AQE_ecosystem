CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  qc_package_id text NOT NULL,
  reference text NOT NULL UNIQUE,
  provider text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('mock', 'live')),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'confirmed', 'rejected', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_orders_user_id_idx ON public.payment_orders(user_id);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_orders_select_own_or_manager ON public.payment_orders;
CREATE POLICY payment_orders_select_own_or_manager
  ON public.payment_orders FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS payment_orders_insert_own ON public.payment_orders;
CREATE POLICY payment_orders_insert_own
  ON public.payment_orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS payment_orders_update_manager ON public.payment_orders;
CREATE POLICY payment_orders_update_manager
  ON public.payment_orders FOR UPDATE
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());