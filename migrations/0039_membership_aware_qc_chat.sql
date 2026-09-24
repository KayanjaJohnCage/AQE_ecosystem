-- Enforce the current membership rule for QC-consuming chat:
-- upgraded/subscribed members are free; registered/unupgraded users pay QC.
CREATE OR REPLACE FUNCTION public.charge_chat_qc(
  p_user_id uuid,
  p_message_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_status text;
  v_wallet_balance numeric(12,2);
  v_daily_used integer;
  v_free_remaining integer;
  v_charge_amount integer;
  v_balance_after numeric(12,2);
  v_ledger_id uuid;
BEGIN
  IF p_message_count IS NULL OR p_message_count < 1 OR p_message_count > 100 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Message count must be between 1 and 100.');
  END IF;

  SELECT membership_status
  INTO v_membership_status
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF v_membership_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Profile not found.');
  END IF;

  -- All upgraded/subscribed members are free. Registered members are charged
  -- for every message, regardless of their displayed tier.
  IF v_membership_status = 'upgraded' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'charged', 0,
      'remainingDailyAllowance', 0,
      'remainingGlobalBalance', NULL,
      'membershipStatus', 'upgraded',
      'free', true
    );
  END IF;

  INSERT INTO public.qc_wallet(user_id, balance)
  VALUES(p_user_id, 0)
  ON CONFLICT(user_id) DO NOTHING;

  SELECT balance
  INTO v_wallet_balance
  FROM public.qc_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_wallet_balance := COALESCE(v_wallet_balance, 0);

  SELECT COALESCE(SUM(amount), 0)::integer
  INTO v_daily_used
  FROM public.qc_ledger
  WHERE user_id = p_user_id
    AND transaction_type = 'chat_message'
    AND direction = 'OUT'
    AND status = 'COMPLETED'
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Kampala')
    AND created_at < date_trunc('day', now() AT TIME ZONE 'Africa/Kampala') + interval '1 day';

  v_free_remaining := 0;
  v_charge_amount := p_message_count;

  IF v_wallet_balance < v_charge_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Insufficient QC balance. Please recharge before sending chat messages.',
      'remainingGlobalBalance', v_wallet_balance,
      'remainingDailyAllowance', 0,
      'membershipStatus', 'registered'
    );
  END IF;

  v_balance_after := v_wallet_balance - v_charge_amount;

  UPDATE public.qc_wallet
  SET balance = v_balance_after, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.qc_ledger (
    user_id, transaction_type, amount, direction, balance_after,
    reference_type, reference_id, description, status, metadata
  )
  VALUES (
    p_user_id, 'chat_message', v_charge_amount, 'OUT', v_balance_after,
    'chat', gen_random_uuid()::text, 'QC chat message charge', 'COMPLETED',
    jsonb_build_object(
      'message_count', p_message_count,
      'daily_used_before', v_daily_used,
      'membership_status', 'registered'
    )
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'charged', v_charge_amount,
    'remainingDailyAllowance', v_free_remaining,
    'remainingGlobalBalance', v_balance_after,
    'ledgerId', v_ledger_id,
    'membershipStatus', 'registered',
    'free', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_chat_qc(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_chat_qc(uuid, integer) TO service_role;
