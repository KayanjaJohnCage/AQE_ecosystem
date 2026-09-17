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
  profile_tier text;
  wallet_balance numeric(12,2);
  daily_used integer;
  free_remaining integer;
  charge_amount integer;
  balance_after numeric(12,2);
  ledger_id uuid;
BEGIN
  IF p_message_count IS NULL OR p_message_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Message count must be greater than zero.');
  END IF;

  SELECT tier INTO profile_tier
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF profile_tier IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Profile not found.');
  END IF;

  SELECT balance INTO wallet_balance
  FROM public.qc_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF wallet_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'QC wallet is not initialized.');
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer INTO daily_used
  FROM public.qc_ledger
  WHERE user_id = p_user_id
    AND transaction_type = 'chat_message'
    AND direction = 'OUT'
    AND status = 'COMPLETED'
    AND created_at::date = current_date;

  free_remaining := GREATEST(0, CASE WHEN profile_tier = 'basic' THEN 0 ELSE 5 END - daily_used);
  charge_amount := GREATEST(0, p_message_count - free_remaining);

  IF wallet_balance < charge_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Insufficient QC balance. Please recharge before sending chat messages.',
      'remainingGlobalBalance', wallet_balance,
      'remainingDailyAllowance', free_remaining
    );
  END IF;

  balance_after := wallet_balance - charge_amount;
  UPDATE public.qc_wallet
  SET balance = balance_after, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.qc_ledger (
    user_id, transaction_type, amount, direction, balance_after,
    reference_type, reference_id, description, status, metadata
  )
  VALUES (
    p_user_id, 'chat_message', charge_amount, 'OUT', balance_after,
    'chat', gen_random_uuid()::text, 'QC chat message charge', 'COMPLETED',
    jsonb_build_object('message_count', p_message_count, 'daily_used_before', daily_used)
  )
  RETURNING id INTO ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'charged', charge_amount,
    'remainingDailyAllowance', GREATEST(0, free_remaining - p_message_count),
    'remainingGlobalBalance', balance_after,
    'ledgerId', ledger_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_chat_qc(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_chat_qc(uuid, integer) TO service_role;
