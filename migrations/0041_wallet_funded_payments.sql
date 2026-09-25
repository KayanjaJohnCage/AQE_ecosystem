-- Allow a confirmed payment order to be funded from the member cash wallet.
-- The wallet debit and the existing payment confirmation run in one database transaction.

CREATE OR REPLACE FUNCTION public.confirm_wallet_payment_atomic(
  p_order_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_wallet public.cash_wallet%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found.';
  END IF;

  IF v_order.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Payment order does not belong to this user.';
  END IF;

  IF v_order.status NOT IN ('initiated','pending') THEN
    RAISE EXCEPTION 'Payment order cannot be funded from wallet from status %.', v_order.status;
  END IF;

  IF lower(COALESCE(v_order.metadata->>'paymentKind','')) IN ('wallet_deposit','') THEN
    RAISE EXCEPTION 'Wallet funding is not valid for a wallet deposit.';
  END IF;

  SELECT * INTO v_wallet
  FROM public.cash_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash wallet not found.';
  END IF;

  IF v_wallet.currency <> v_order.currency THEN
    RAISE EXCEPTION 'Wallet currency does not match the payment currency.';
  END IF;

  IF v_wallet.available_balance < v_order.amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance.';
  END IF;

  UPDATE public.cash_wallet
  SET available_balance = available_balance - v_order.amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.cash_wallet_ledger(
    user_id, payment_order_id, amount, direction, currency, balance_after,
    reference_type, reference_id
  )
  VALUES(
    p_user_id, v_order.id, v_order.amount, 'DEBIT', v_order.currency,
    v_wallet.available_balance - v_order.amount,
    'WALLET_PAYMENT', v_order.reference
  )
  ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

  v_result := public.confirm_payment_order_atomic(
    v_order.id,
    p_user_id
  );

  RETURN v_result || jsonb_build_object(
    'fundingSource', 'wallet',
    'walletAmountDebited', v_order.amount,
    'walletBalanceAfter', v_wallet.available_balance - v_order.amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_wallet_payment_atomic(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_wallet_payment_atomic(uuid,uuid)
  TO service_role;
