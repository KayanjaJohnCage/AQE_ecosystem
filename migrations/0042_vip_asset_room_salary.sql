-- VIP Asset Room: PIN lock, salary balance, monthly salary by direct invite count,
-- and atomic transfer of unlocked salary into the cash wallet.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.vip_asset_rooms (
  user_id uuid PRIMARY KEY,
  salary_balance numeric NOT NULL DEFAULT 0 CHECK (salary_balance >= 0),
  withdrawn_salary_total numeric NOT NULL DEFAULT 0 CHECK (withdrawn_salary_total >= 0),
  pin_hash text,
  pin_set_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period text NOT NULL,
  invite_count integer NOT NULL DEFAULT 0 CHECK (invite_count >= 0),
  salary_per_invite numeric NOT NULL CHECK (salary_per_invite >= 0),
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'credited' CHECK (status IN ('credited','zero')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period)
);

CREATE TABLE IF NOT EXISTS public.vip_asset_room_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vip_salary_user_period_idx
  ON public.vip_salary_payments(user_id, period DESC);
CREATE INDEX IF NOT EXISTS vip_asset_session_user_idx
  ON public.vip_asset_room_sessions(user_id, expires_at);

ALTER TABLE public.vip_asset_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_asset_room_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.issue_vip_salary(
  p_user_id uuid,
  p_salary numeric,
  p_currency text,
  p_period text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invites integer := 0;
  v_amount numeric := 0;
  v_existing public.vip_salary_payments%ROWTYPE;
  v_currency text := COALESCE(NULLIF(trim(p_currency), ''), 'UGX');
BEGIN
  IF p_salary IS NULL OR p_salary < 0 THEN
    RAISE EXCEPTION 'Invalid VIP salary per invite.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND tier = 'vip'
  ) THEN
    RAISE EXCEPTION 'Only VIP members can receive VIP salary.';
  END IF;

  SELECT * INTO v_existing
  FROM public.vip_salary_payments
  WHERE user_id = p_user_id AND period = p_period
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'alreadyPaid', true,
      'period', p_period,
      'inviteCount', v_existing.invite_count,
      'amount', v_existing.amount,
      'currency', v_existing.currency
    );
  END IF;

  SELECT COUNT(*) INTO v_invites
  FROM public.profiles
  WHERE referred_by = p_user_id;

  v_amount := round(v_invites * p_salary, 2);

  INSERT INTO public.vip_asset_rooms(user_id, salary_balance)
  VALUES(p_user_id, 0)
  ON CONFLICT(user_id) DO NOTHING;

  UPDATE public.vip_asset_rooms
  SET salary_balance = salary_balance + v_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.vip_salary_payments(
    user_id, period, invite_count, salary_per_invite, amount, currency, status
  )
  VALUES(
    p_user_id, p_period, v_invites, p_salary, v_amount, v_currency,
    CASE WHEN v_amount > 0 THEN 'credited' ELSE 'zero' END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyPaid', false,
    'period', p_period,
    'inviteCount', v_invites,
    'salaryPerInvite', p_salary,
    'amount', v_amount,
    'currency', v_currency,
    'storedIn', 'vip_asset_room'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_vip_salary_atomic(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset public.vip_asset_rooms%ROWTYPE;
  v_wallet public.cash_wallet%ROWTYPE;
  v_date date := (now() AT TIME ZONE 'Africa/Kampala')::date;
  v_amount numeric;
  v_after numeric;
  v_currency text;
  v_reference text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND tier = 'vip'
  ) THEN
    RAISE EXCEPTION 'Only VIP members can withdraw VIP salary.';
  END IF;

  IF EXTRACT(DAY FROM v_date) < 20 THEN
    RAISE EXCEPTION 'VIP salary cannot be withdrawn before the 20th of the month.';
  END IF;

  SELECT * INTO v_asset
  FROM public.vip_asset_rooms
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_asset.salary_balance <= 0 THEN
    RAISE EXCEPTION 'No VIP salary is available in the Asset Room.';
  END IF;

  v_amount := v_asset.salary_balance;
  v_reference := 'VIP-SALARY-WITHDRAWAL-' || p_user_id::text || '-' || to_char(v_date, 'YYYY-MM');
  v_currency := 'UGX';

  SELECT * INTO v_wallet
  FROM public.cash_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.cash_wallet(user_id, available_balance, pending_balance, currency)
    VALUES(p_user_id, 0, 0, v_currency);
    SELECT * INTO v_wallet
    FROM public.cash_wallet
    WHERE user_id = p_user_id
    FOR UPDATE;
  ELSE
    v_currency := v_wallet.currency;
  END IF;

  v_after := v_wallet.available_balance + v_amount;

  UPDATE public.vip_asset_rooms
  SET salary_balance = 0,
      withdrawn_salary_total = withdrawn_salary_total + v_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  UPDATE public.cash_wallet
  SET available_balance = v_after,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.cash_wallet_ledger(
    user_id, amount, direction, currency, balance_after,
    reference_type, reference_id
  )
  VALUES(
    p_user_id, v_amount, 'CREDIT', v_currency, v_after,
    'VIP_SALARY_WITHDRAWAL', v_reference
  );

  RETURN jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'currency', v_currency,
    'walletBalanceAfter', v_after,
    'reference', v_reference,
    'withdrawnAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_vip_salary(uuid,numeric,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vip_salary(uuid,numeric,text,text)
  TO service_role;

REVOKE ALL ON FUNCTION public.withdraw_vip_salary_atomic(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_vip_salary_atomic(uuid)
  TO service_role;
