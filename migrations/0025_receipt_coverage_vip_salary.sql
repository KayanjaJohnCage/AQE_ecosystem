-- Receipt coverage for membership tier changes and direct profile boosts.

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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_tier_receipt_trigger ON public.profiles;
CREATE TRIGGER profile_tier_receipt_trigger
AFTER UPDATE OF tier ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.aqe_profile_tier_receipt();

CREATE OR REPLACE FUNCTION public.aqe_profile_boost_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Campaign RPC creates one richer combined receipt containing QC/cash/boost.
  IF NEW.metadata ? 'campaignId' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.transaction_receipts(
    receipt_number,user_id,transaction_type,source,reference_id,boost_days,status,description,metadata
  )
  VALUES(
    public.aqe_receipt_number(),NEW.user_id,'PROFILE_BOOST',NEW.source,NEW.id::text,
    NEW.duration_days,'COMPLETED',COALESCE(NEW.reason,'AQE profile boost'),
    jsonb_build_object('label',NEW.label,'startsAt',NEW.starts_at,'expiresAt',NEW.expires_at,'source',NEW.source)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_boost_receipt_trigger ON public.profile_boosts;
CREATE TRIGGER profile_boost_receipt_trigger
AFTER INSERT ON public.profile_boosts
FOR EACH ROW EXECUTE FUNCTION public.aqe_profile_boost_receipt();

-- A manager-safe, idempotent VIP salary credit operation.
CREATE OR REPLACE FUNCTION public.issue_vip_salary(
  p_user_id uuid,
  p_salary numeric,
  p_currency text DEFAULT 'UGX',
  p_period text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.cash_wallet%ROWTYPE;
  v_period text := COALESCE(p_period, to_char(now() AT TIME ZONE 'Africa/Kampala','YYYY-MM'));
  v_reference text := 'VIP-SALARY-' || p_user_id::text || '-' || v_period;
  v_after numeric;
BEGIN
  IF p_salary <= 0 THEN RAISE EXCEPTION 'VIP salary must be greater than zero.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_wallet_ledger
    WHERE user_id=p_user_id AND reference_type='VIP_SALARY' AND reference_id=v_reference
  ) THEN
    RETURN jsonb_build_object('ok',true,'alreadyPaid',true,'reference',v_reference);
  END IF;

  INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
  VALUES(p_user_id,0,0,p_currency)
  ON CONFLICT(user_id) DO NOTHING;

  SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=p_user_id FOR UPDATE;
  v_after := v_wallet.available_balance + p_salary;
  UPDATE public.cash_wallet
  SET available_balance=v_after,currency=p_currency,updated_at=now()
  WHERE user_id=p_user_id;

  INSERT INTO public.cash_wallet_ledger(
    user_id,amount,direction,currency,balance_after,reference_type,reference_id
  )
  VALUES(p_user_id,p_salary,'CREDIT',p_currency,v_after,'VIP_SALARY',v_reference);

  RETURN jsonb_build_object('ok',true,'alreadyPaid',false,'reference',v_reference,'amount',p_salary,'currency',p_currency);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_vip_salary(uuid,numeric,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vip_salary(uuid,numeric,text,text) TO service_role;
