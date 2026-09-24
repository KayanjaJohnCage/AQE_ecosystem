-- Atomic daily QC reward claims.
-- Uses the existing weekly reward values and Kampala calendar day.
CREATE TABLE IF NOT EXISTS public.daily_qc_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  claim_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date)
);

CREATE INDEX IF NOT EXISTS daily_qc_claims_user_date_idx
  ON public.daily_qc_claims (user_id, claim_date DESC);

ALTER TABLE public.daily_qc_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_qc_claims_select_owner ON public.daily_qc_claims;
CREATE POLICY daily_qc_claims_select_owner
  ON public.daily_qc_claims FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.claim_daily_qc_reward_atomic(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_date date := (now() AT TIME ZONE 'Africa/Kampala')::date;
  v_day integer := EXTRACT(DOW FROM v_claim_date)::integer;
  v_reward numeric := CASE v_day
    WHEN 0 THEN 0
    WHEN 1 THEN 0.2
    WHEN 2 THEN 0.25
    WHEN 3 THEN 0.3
    WHEN 4 THEN 0.35
    WHEN 5 THEN 0.4
    WHEN 6 THEN 0.45
    ELSE 0
  END;
  v_balance numeric;
  v_after numeric;
  v_claim_id uuid;
BEGIN
  INSERT INTO public.daily_qc_claims(user_id, claim_date, amount)
  VALUES(p_user_id, v_claim_date, v_reward)
  ON CONFLICT(user_id, claim_date) DO NOTHING
  RETURNING id INTO v_claim_id;

  IF v_claim_id IS NULL THEN
    SELECT amount INTO v_reward
    FROM public.daily_qc_claims
    WHERE user_id = p_user_id AND claim_date = v_claim_date;

    SELECT balance INTO v_balance
    FROM public.qc_wallet
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'alreadyClaimed', true,
      'amount', COALESCE(v_reward, 0),
      'balanceAfter', COALESCE(v_balance, 0),
      'claimDate', v_claim_date
    );
  END IF;

  INSERT INTO public.qc_wallet(user_id, balance)
  VALUES(p_user_id, 0)
  ON CONFLICT(user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.qc_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_after := COALESCE(v_balance, 0) + v_reward;

  UPDATE public.qc_wallet
  SET balance = v_after, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.qc_ledger(
    user_id,
    transaction_type,
    amount,
    direction,
    balance_after,
    reference_type,
    reference_id,
    description,
    status,
    metadata
  )
  VALUES(
    p_user_id,
    'daily_reward',
    v_reward,
    'IN',
    v_after,
    'DAILY_QC_REWARD',
    v_claim_id::text,
    'Daily QC reward',
    'COMPLETED',
    jsonb_build_object('claimDate', v_claim_date)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyClaimed', false,
    'amount', v_reward,
    'balanceAfter', v_after,
    'claimDate', v_claim_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_qc_reward_atomic(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_qc_reward_atomic(uuid)
  TO service_role;
