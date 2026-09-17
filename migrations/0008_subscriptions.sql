CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier text NOT NULL CHECK (tier IN ('basic', 'premium', 'vip')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'cancelled', 'expired', 'pending')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select_own_or_manager ON public.subscriptions;
CREATE POLICY subscriptions_select_own_or_manager
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS subscriptions_insert_own ON public.subscriptions;
CREATE POLICY subscriptions_insert_own
  ON public.subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS subscriptions_update_manager ON public.subscriptions;
CREATE POLICY subscriptions_update_manager
  ON public.subscriptions FOR UPDATE
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());