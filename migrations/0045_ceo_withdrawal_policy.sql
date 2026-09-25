-- CEO withdrawal policy:
-- Minimum UGX 30,000; maximum UGX 5,000,000.
-- 10% service charge on every withdrawal.
-- Basic: weekends only, with at least 1 day between applications.
-- Premium: one application every 2 days.
-- VIP: one application every 1 day.
-- Basic/Premium retain the existing minimum of two direct invites.
-- On successful payment, the 10% fee is credited to the member's direct Team Leader.
-- Historical completed withdrawals keep their recorded fee; pending requests are recalculated to 10%.

ALTER TABLE public.vip_withdrawal_requests
  ALTER COLUMN service_charge_rate SET DEFAULT 0.10;

UPDATE public.vip_withdrawal_requests
SET
  service_charge_rate = 0.10,
  service_charge_amount = ROUND(amount * 0.10, 2),
  net_amount = ROUND(amount - (amount * 0.10), 2)
WHERE status IN ('PENDING', 'APPROVED');

UPDATE public.platform_settings
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{withdrawal,serviceChargeRate}',
    '0.10'::jsonb,
    true
  ),
  '{withdrawal,serviceChargeLabel}',
  '"10% withdrawal service charge"'::jsonb,
  true
)
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.request_cash_withdrawal_atomic(
  p_user_id uuid,
  p_amount numeric,
  p_tier text,
  p_payment_method text,
  p_recipient_name text,
  p_recipient_account text,
  p_currency text,
  p_service_charge_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.cash_wallet%ROWTYPE;
  v_withdrawal public.vip_withdrawal_requests%ROWTYPE;
  v_last_created_at timestamptz;
  v_fee numeric;
  v_net numeric;
  v_kampala_date date := (now() AT TIME ZONE 'Africa/Kampala')::date;
  v_direct_invites integer := 0;
  v_cooldown_hours integer := 24;
BEGIN
  IF lower(COALESCE(p_tier, '')) NOT IN ('basic', 'premium', 'vip') THEN
    RAISE EXCEPTION 'A valid membership tier is required for withdrawals.';
  END IF;

  IF p_currency <> 'UGX' THEN
    RAISE EXCEPTION 'Withdrawals are processed in UGX.';
  END IF;

  IF p_amount IS NULL OR p_amount < 30000 THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is UGX 30,000.';
  END IF;

  IF p_amount > 5000000 THEN
    RAISE EXCEPTION 'Maximum withdrawal amount is UGX 5,000,000.';
  END IF;

  IF p_service_charge_rate IS NULL OR p_service_charge_rate <> 0.10 THEN
    RAISE EXCEPTION 'Withdrawal service charge must be 10%.';
  END IF;

  IF lower(p_tier) IN ('basic', 'premium') THEN
    SELECT COUNT(*)
    INTO v_direct_invites
    FROM public.profiles
    WHERE referred_by = p_user_id;

    IF v_direct_invites < 2 THEN
      RAISE EXCEPTION 'Basic and Premium members need at least 2 direct invites before withdrawing.';
    END IF;
  END IF;

  IF lower(p_tier) = 'basic'
     AND EXTRACT(DOW FROM v_kampala_date) NOT IN (0, 6) THEN
    RAISE EXCEPTION 'Basic withdrawals are available on weekends only.';
  END IF;

  v_cooldown_hours := CASE lower(p_tier)
    WHEN 'premium' THEN 48
    ELSE 24
  END;

  -- Lock the member wallet first. This serializes concurrent withdrawal
  -- applications for the same member before the cooldown is checked.
  SELECT * INTO v_wallet
  FROM public.cash_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash wallet not found.';
  END IF;

  SELECT created_at
  INTO v_last_created_at
  FROM public.vip_withdrawal_requests
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_last_created_at IS NOT NULL
     AND now() < v_last_created_at + make_interval(hours => v_cooldown_hours) THEN
    RAISE EXCEPTION 'Withdrawal frequency limit reached. Please wait until the required interval has passed.';
  END IF;

  IF v_wallet.currency <> p_currency THEN
    RAISE EXCEPTION 'Wallet currency does not match the withdrawal currency.';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance.';
  END IF;

  v_fee := round(p_amount * 0.10, 2);
  v_net := round(p_amount - v_fee, 2);

  INSERT INTO public.vip_withdrawal_requests (
    user_id, tier, payment_method, recipient_name, recipient_account,
    currency, amount, service_charge_rate, service_charge_amount, net_amount, status
  )
  VALUES (
    p_user_id, lower(p_tier), p_payment_method, trim(p_recipient_name),
    trim(p_recipient_account), p_currency, p_amount, 0.10,
    v_fee, v_net, 'PENDING'
  )
  RETURNING * INTO v_withdrawal;

  UPDATE public.cash_wallet
  SET available_balance = available_balance - p_amount,
      pending_balance = pending_balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.cash_wallet_ledger (
    user_id, payment_order_id, amount, direction, currency, balance_after,
    reference_type, reference_id
  )
  VALUES (
    p_user_id, v_withdrawal.id, p_amount, 'DEBIT', p_currency,
    v_wallet.available_balance - p_amount, 'WITHDRAWAL_RESERVATION',
    v_withdrawal.id::text
  );

  RETURN jsonb_build_object(
    'id', v_withdrawal.id,
    'userId', v_withdrawal.user_id,
    'tier', v_withdrawal.tier,
    'paymentMethod', v_withdrawal.payment_method,
    'recipientName', v_withdrawal.recipient_name,
    'recipientAccount', v_withdrawal.recipient_account,
    'currency', v_withdrawal.currency,
    'grossAmount', v_withdrawal.amount,
    'serviceChargeRate', v_withdrawal.service_charge_rate,
    'serviceChargeAmount', v_withdrawal.service_charge_amount,
    'netAmount', v_withdrawal.net_amount,
    'status', v_withdrawal.status,
    'createdAt', v_withdrawal.created_at,
    'directInviteCount', v_direct_invites
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_cash_withdrawal_atomic(
  p_withdrawal_id uuid,
  p_status text,
  p_actor_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal public.vip_withdrawal_requests%ROWTYPE;
  v_wallet public.cash_wallet%ROWTYPE;
  v_leader uuid;
  v_leader_wallet public.cash_wallet%ROWTYPE;
  v_refund boolean := false;
  v_leader_after numeric;
BEGIN
  IF p_status NOT IN ('APPROVED', 'REJECTED', 'PAID', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid withdrawal decision.';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.vip_withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found.';
  END IF;

  IF v_withdrawal.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only pending withdrawals can be processed.';
  END IF;

  v_refund := p_status IN ('REJECTED', 'CANCELLED');

  SELECT * INTO v_wallet
  FROM public.cash_wallet
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash wallet not found.';
  END IF;

  IF v_wallet.pending_balance < v_withdrawal.amount THEN
    RAISE EXCEPTION 'Pending withdrawal balance is inconsistent.';
  END IF;

  IF v_refund THEN
    UPDATE public.cash_wallet
    SET available_balance = available_balance + v_withdrawal.amount,
        pending_balance = pending_balance - v_withdrawal.amount,
        updated_at = now()
    WHERE user_id = v_withdrawal.user_id;

    INSERT INTO public.cash_wallet_ledger (
      user_id, payment_order_id, amount, direction, currency,
      balance_after, reference_type, reference_id
    )
    VALUES (
      v_withdrawal.user_id, v_withdrawal.id, v_withdrawal.amount, 'CREDIT',
      v_withdrawal.currency,
      v_wallet.available_balance + v_withdrawal.amount,
      'WITHDRAWAL_REFUND', v_withdrawal.id::text
    )
    ON CONFLICT (user_id, payment_order_id, direction) DO NOTHING;

  ELSIF p_status = 'PAID' THEN
    -- PAID is the system's persisted equivalent of the CEO's SUCCEED state:
    -- management confirms that the net payout has already been sent.
    UPDATE public.cash_wallet
    SET pending_balance = pending_balance - v_withdrawal.amount,
        updated_at = now()
    WHERE user_id = v_withdrawal.user_id;

    SELECT referred_by
    INTO v_leader
    FROM public.profiles
    WHERE user_id = v_withdrawal.user_id;

    IF v_leader IS NOT NULL AND v_leader <> v_withdrawal.user_id
       AND v_withdrawal.service_charge_amount > 0 THEN
      INSERT INTO public.cash_wallet(
        user_id, available_balance, pending_balance, currency
      )
      VALUES (v_leader, 0, 0, v_withdrawal.currency)
      ON CONFLICT (user_id) DO NOTHING;

      SELECT * INTO v_leader_wallet
      FROM public.cash_wallet
      WHERE user_id = v_leader
      FOR UPDATE;

      IF v_leader_wallet.currency <> v_withdrawal.currency THEN
        RAISE EXCEPTION 'Team Leader wallet currency does not match the withdrawal currency.';
      END IF;

      v_leader_after := v_leader_wallet.available_balance
        + v_withdrawal.service_charge_amount;

      UPDATE public.cash_wallet
      SET available_balance = v_leader_after,
          updated_at = now()
      WHERE user_id = v_leader;

      INSERT INTO public.cash_wallet_ledger (
        user_id, payment_order_id, amount, direction, currency,
        balance_after, reference_type, reference_id
      )
      VALUES (
        v_leader, v_withdrawal.id, v_withdrawal.service_charge_amount,
        'CREDIT', v_withdrawal.currency, v_leader_after,
        'TEAM_LEADER_WITHDRAWAL_FEE', v_withdrawal.id::text
      )
      ON CONFLICT (user_id, payment_order_id, direction) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.vip_withdrawal_requests
  SET status = p_status,
      reviewed_at = now(),
      reviewed_by = p_actor_id,
      review_reason = NULLIF(trim(COALESCE(p_reason, '')), '')
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', p_status,
    'refunded', v_refund,
    'grossAmount', v_withdrawal.amount,
    'serviceChargeAmount', v_withdrawal.service_charge_amount,
    'netAmount', v_withdrawal.net_amount,
    'teamLeaderFeeCredited',
      CASE WHEN p_status = 'PAID' THEN v_withdrawal.service_charge_amount ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text) TO service_role;
