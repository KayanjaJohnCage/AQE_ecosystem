-- Asset Room PIN helpers and prize cash-credit idempotency correction.

CREATE OR REPLACE FUNCTION public.set_vip_asset_pin(
  p_user_id uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must contain 4 to 6 digits.';
  END IF;

  INSERT INTO public.vip_asset_rooms(user_id,pin_hash,pin_set_at)
  VALUES(p_user_id,crypt(p_pin,gen_salt('bf')),now())
  ON CONFLICT(user_id) DO UPDATE SET
    pin_hash=crypt(p_pin,gen_salt('bf')),
    pin_set_at=now(),
    updated_at=now();

  DELETE FROM public.vip_asset_room_sessions WHERE user_id=p_user_id;
  RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_vip_asset_pin(
  p_user_id uuid,
  p_pin text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT pin_hash INTO v_hash
  FROM public.vip_asset_rooms
  WHERE user_id=p_user_id;

  IF v_hash IS NULL OR p_pin IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_hash = crypt(p_pin, v_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.set_vip_asset_pin(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_vip_asset_pin(uuid,text)
  TO service_role;

REVOKE ALL ON FUNCTION public.verify_vip_asset_pin(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_vip_asset_pin(uuid,text)
  TO service_role;

-- The claim row is locked before this credit is made, so a second approval cannot
-- credit the same prize twice.
DROP FUNCTION IF EXISTS public.approve_prize_cash_claim(uuid,uuid,numeric,text);

CREATE OR REPLACE FUNCTION public.approve_prize_cash_claim(
  p_claim_id uuid,
  p_manager_id uuid,
  p_cash_amount numeric,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.aqe_prize_claims%ROWTYPE;
  v_wallet public.cash_wallet%ROWTYPE;
  v_currency text := 'UGX';
  v_after numeric;
  v_amount numeric;
BEGIN
  IF p_cash_amount IS NULL OR p_cash_amount <= 0 THEN
    RAISE EXCEPTION 'A positive cash conversion amount is required.';
  END IF;

  SELECT * INTO v_claim
  FROM public.aqe_prize_claims
  WHERE id=p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Prize claim not found.'; END IF;
  IF v_claim.mode <> 'cash' THEN RAISE EXCEPTION 'This claim is not a cash conversion request.'; END IF;
  IF v_claim.status <> 'pending' THEN RAISE EXCEPTION 'Prize claim is already resolved.'; END IF;

  SELECT COALESCE(settings->>'walletCurrency','UGX')
  INTO v_currency
  FROM public.platform_settings
  WHERE id=1;

  v_amount := round(p_cash_amount,2);

  INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
  VALUES(v_claim.user_id,0,0,v_currency)
  ON CONFLICT(user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.cash_wallet
  WHERE user_id=v_claim.user_id
  FOR UPDATE;

  v_after := v_wallet.available_balance + v_amount;

  UPDATE public.cash_wallet
  SET available_balance=v_after,currency=v_currency,updated_at=now()
  WHERE user_id=v_claim.user_id;

  INSERT INTO public.cash_wallet_ledger(
    user_id,amount,direction,currency,balance_after,reference_type,reference_id
  )
  VALUES(
    v_claim.user_id,v_amount,'CREDIT',v_currency,v_after,
    'PRIZE_CASH_CONVERSION',v_claim.id::text
  );

  UPDATE public.aqe_prize_claims
  SET status='approved',
      cash_amount=v_amount,
      manager_note=NULLIF(trim(p_note),''),
      approved_by=p_manager_id,
      approved_at=now(),
      updated_at=now()
  WHERE id=v_claim.id;

  RETURN jsonb_build_object(
    'ok',true,'claimId',v_claim.id,'userId',v_claim.user_id,
    'amount',v_amount,'currency',v_currency,'walletBalanceAfter',v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_prize_cash_claim(uuid,uuid,numeric,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_prize_cash_claim(uuid,uuid,numeric,text)
  TO service_role;
