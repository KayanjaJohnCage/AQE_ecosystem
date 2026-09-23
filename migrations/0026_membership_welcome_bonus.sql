-- Issue the configured UGX welcome bonus once on a paid membership upgrade.

CREATE OR REPLACE FUNCTION public.issue_membership_welcome_bonus(
  p_user_id uuid,
  p_tier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_bonus numeric := 0;
  v_currency text := 'UGX';
  v_wallet public.cash_wallet%ROWTYPE;
  v_reference text := 'WELCOME-BONUS-' || p_user_id::text;
  v_after numeric;
BEGIN
  SELECT settings INTO v_settings FROM public.platform_settings WHERE id=1;
  v_bonus := COALESCE((v_settings->'pricing'->>'welcomeBonus')::numeric, 3000);
  v_currency := COALESCE(v_settings->>'walletCurrency','UGX');

  IF v_bonus <= 0 THEN RETURN jsonb_build_object('ok',true,'issued',false); END IF;

  IF EXISTS (
    SELECT 1 FROM public.cash_wallet_ledger
    WHERE user_id=p_user_id AND reference_type='WELCOME_BONUS' AND reference_id=v_reference
  ) THEN
    RETURN jsonb_build_object('ok',true,'issued',false,'alreadyIssued',true);
  END IF;

  INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
  VALUES(p_user_id,0,0,v_currency)
  ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=p_user_id FOR UPDATE;
  v_after := v_wallet.available_balance + v_bonus;
  UPDATE public.cash_wallet SET available_balance=v_after,currency=v_currency,updated_at=now() WHERE user_id=p_user_id;

  INSERT INTO public.cash_wallet_ledger(user_id,amount,direction,currency,balance_after,reference_type,reference_id)
  VALUES(p_user_id,v_bonus,'CREDIT',v_currency,v_after,'WELCOME_BONUS',v_reference);

  RETURN jsonb_build_object('ok',true,'issued',true,'amount',v_bonus,'currency',v_currency,'tier',p_tier);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_membership_welcome_bonus(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_membership_welcome_bonus(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.aqe_profile_tier_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_amount numeric := NULL;
  v_currency text := NULL;
  v_paid_upgrade boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.tier,'basic') IS DISTINCT FROM COALESCE(NEW.tier,'basic') THEN
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE user_id = NEW.user_id
      AND status = 'confirmed'
      AND COALESCE(metadata->>'requestedTier','') = NEW.tier
    ORDER BY updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_paid_upgrade := true;
      v_amount := v_order.amount;
      v_currency := v_order.currency;
    END IF;

    INSERT INTO public.transaction_receipts(
      receipt_number,user_id,transaction_type,source,reference_id,amount,currency,status,description,metadata
    )
    VALUES(
      public.aqe_receipt_number(),NEW.user_id,'MEMBERSHIP_UPGRADE','membership_upgrade',
      COALESCE(v_order.id::text, NEW.user_id::text),v_amount,v_currency,'COMPLETED',
      'AQE membership tier change',
      jsonb_build_object('previousTier',OLD.tier,'newTier',NEW.tier,'paymentOrderId',v_order.id)
    );

    -- Welcome bonus is granted only for a real paid upgrade found above.
    IF v_paid_upgrade THEN
      PERFORM public.issue_membership_welcome_bonus(NEW.user_id, NEW.tier);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_tier_receipt_trigger ON public.profiles;
CREATE TRIGGER profile_tier_receipt_trigger
AFTER UPDATE OF tier ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.aqe_profile_tier_receipt();
