ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid;

UPDATE public.profiles
SET referral_code = 'AQE-' || upper(substr(md5(user_id::text), 1, 12))
WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique_idx
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
  ON public.profiles (referred_by);

CREATE TABLE IF NOT EXISTS public.cash_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  payment_order_id uuid,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  balance_after numeric(12,2) NOT NULL,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, payment_order_id, direction)
);

CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  payment_order_id uuid NOT NULL,
  relationship_level integer NOT NULL CHECK (relationship_level IN (1, 2)),
  rate numeric(6,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (char_length(currency) = 3),
  status text NOT NULL DEFAULT 'CREDITED' CHECK (status IN ('CREDITED', 'REVERSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beneficiary_user_id, payment_order_id, relationship_level)
);

ALTER TABLE public.cash_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_wallet_ledger_select_own_or_manager ON public.cash_wallet_ledger;
CREATE POLICY cash_wallet_ledger_select_own_or_manager
  ON public.cash_wallet_ledger FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS referral_earnings_select_own_or_manager ON public.referral_earnings;
CREATE POLICY referral_earnings_select_own_or_manager
  ON public.referral_earnings FOR SELECT
  USING (beneficiary_user_id = auth.uid() OR public.is_aqe_manager());

CREATE OR REPLACE FUNCTION public.confirm_payment_order_atomic(
  p_order_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_wallet public.cash_wallet%ROWTYPE;
  v_tier text;
  v_direct uuid;
  v_indirect uuid;
  v_direct_earning_id uuid;
  v_indirect_earning_id uuid;
  v_direct_rate numeric := 0.10;
  v_indirect_rate numeric := 0.05;
  v_direct_amount numeric;
  v_indirect_amount numeric;
  v_settings jsonb;
BEGIN
  SELECT settings INTO v_settings
  FROM public.platform_settings
  WHERE id = 1;
  v_direct_rate := COALESCE((v_settings->'referralRates'->>'direct')::numeric, 0.10);
  v_indirect_rate := COALESCE((v_settings->'referralRates'->>'indirect')::numeric, 0.05);

  IF v_direct_rate < 0 OR v_direct_rate > 1 OR v_indirect_rate < 0 OR v_indirect_rate > 1 THEN
    RAISE EXCEPTION 'Referral rates must be between 0 and 1';
  END IF;

  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found';
  END IF;

  IF v_order.status = 'confirmed' THEN
    RETURN jsonb_build_object('alreadyConfirmed', true, 'status', 'confirmed');
  END IF;

  IF v_order.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'Payment order cannot be confirmed from status %', v_order.status;
  END IF;

  v_tier := COALESCE(v_order.metadata->>'requestedTier', 'basic');
  IF v_tier NOT IN ('basic', 'premium', 'vip') THEN
    v_tier := 'basic';
  END IF;

  UPDATE public.payment_orders
  SET status = 'confirmed', updated_at = now()
  WHERE id = v_order.id;

  INSERT INTO public.cash_wallet (user_id, available_balance, pending_balance, currency)
  VALUES (v_order.user_id, v_order.amount, 0, v_order.currency)
  ON CONFLICT (user_id) DO UPDATE
  SET available_balance = public.cash_wallet.available_balance + EXCLUDED.available_balance,
      currency = EXCLUDED.currency,
      updated_at = now()
  RETURNING * INTO v_wallet;

  INSERT INTO public.cash_wallet_ledger
    (user_id, payment_order_id, amount, direction, currency, balance_after, reference_type, reference_id)
  VALUES
    (v_order.user_id, v_order.id, v_order.amount, 'CREDIT', v_order.currency,
     v_wallet.available_balance, 'PAYMENT_CONFIRMATION', v_order.reference)
  ON CONFLICT (payment_order_id, direction) DO NOTHING;

  UPDATE public.profiles
  SET tier = v_tier, updated_at = now()
  WHERE user_id = v_order.user_id;

  SELECT referred_by INTO v_direct
  FROM public.profiles
  WHERE user_id = v_order.user_id;

  IF v_direct IS NOT NULL THEN
    v_direct_amount := round(v_order.amount * v_direct_rate, 2);
    IF v_direct_amount > 0 THEN
      INSERT INTO public.referral_earnings
        (beneficiary_user_id, referred_user_id, payment_order_id, relationship_level, rate, amount, currency)
      VALUES (v_direct, v_order.user_id, v_order.id, 1, v_direct_rate, v_direct_amount, v_order.currency)
      ON CONFLICT (beneficiary_user_id, payment_order_id, relationship_level) DO NOTHING
      RETURNING id INTO v_direct_earning_id;

      IF v_direct_earning_id IS NOT NULL THEN
        SELECT beneficiary_user_id INTO v_direct
        FROM public.referral_earnings
        WHERE id = v_direct_earning_id;
        INSERT INTO public.cash_wallet (user_id, available_balance, pending_balance, currency)
        VALUES (v_direct, v_direct_amount, 0, v_order.currency)
        ON CONFLICT (user_id) DO UPDATE
        SET available_balance = public.cash_wallet.available_balance + EXCLUDED.available_balance,
            currency = EXCLUDED.currency,
            updated_at = now();
        INSERT INTO public.cash_wallet_ledger
          (user_id, payment_order_id, amount, direction, currency, balance_after, reference_type, reference_id)
        SELECT v_direct, v_order.id, v_direct_amount, 'CREDIT', v_order.currency,
          available_balance, 'DIRECT_REFERRAL_EARNING', v_order.reference
        FROM public.cash_wallet
        WHERE user_id = v_direct
        ON CONFLICT (user_id, payment_order_id, direction) DO NOTHING;
      END IF;
    END IF;

    SELECT referred_by INTO v_indirect
    FROM public.profiles
    WHERE user_id = v_direct;

    IF v_indirect IS NOT NULL THEN
      v_indirect_amount := round(v_order.amount * v_indirect_rate, 2);
      IF v_indirect_amount > 0 THEN
        INSERT INTO public.referral_earnings
          (beneficiary_user_id, referred_user_id, payment_order_id, relationship_level, rate, amount, currency)
        VALUES (v_indirect, v_order.user_id, v_order.id, 2, v_indirect_rate, v_indirect_amount, v_order.currency)
        ON CONFLICT (beneficiary_user_id, payment_order_id, relationship_level) DO NOTHING
        RETURNING id INTO v_indirect_earning_id;

        IF v_indirect_earning_id IS NOT NULL THEN
          SELECT beneficiary_user_id INTO v_indirect
          FROM public.referral_earnings
          WHERE id = v_indirect_earning_id;
          INSERT INTO public.cash_wallet (user_id, available_balance, pending_balance, currency)
          VALUES (v_indirect, v_indirect_amount, 0, v_order.currency)
          ON CONFLICT (user_id) DO UPDATE
          SET available_balance = public.cash_wallet.available_balance + EXCLUDED.available_balance,
              currency = EXCLUDED.currency,
              updated_at = now();
          INSERT INTO public.cash_wallet_ledger
            (user_id, payment_order_id, amount, direction, currency, balance_after, reference_type, reference_id)
          SELECT v_indirect, v_order.id, v_indirect_amount, 'CREDIT', v_order.currency,
            available_balance, 'INDIRECT_REFERRAL_EARNING', v_order.reference
          FROM public.cash_wallet
          WHERE user_id = v_indirect
          ON CONFLICT (user_id, payment_order_id, direction) DO NOTHING;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'alreadyConfirmed', false,
    'status', 'confirmed',
    'walletCredited', v_order.amount,
    'currency', v_order.currency,
    'upgradedTier', v_tier,
    'directReferralRate', v_direct_rate,
    'indirectReferralRate', v_indirect_rate
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid, uuid) TO service_role;
