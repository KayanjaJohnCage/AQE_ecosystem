-- Correct payment confirmation semantics: upgrades change membership, deposits fund cash wallet,
-- QC payments fund QC wallet, and subscriptions create subscription records. Referral rewards
-- are generated only from paid membership upgrades.

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
  v_kind text;
  v_tier text;
  v_direct uuid;
  v_indirect uuid;
  v_direct_tier text;
  v_indirect_tier text;
  v_direct_earning_id uuid;
  v_indirect_earning_id uuid;
  v_direct_rate numeric := 0.10;
  v_indirect_rate numeric := 0.05;
  v_settings jsonb;
  v_tier_rates jsonb;
  v_direct_amount numeric;
  v_indirect_amount numeric;
  v_wallet public.cash_wallet%ROWTYPE;
  v_qc_balance numeric;
  v_qc_after numeric;
  v_qc_amount numeric;
  v_subscription_id uuid;
  v_vip_user_id uuid;
  v_vip_subscription jsonb;
  v_vip_wallet public.cash_wallet%ROWTYPE;
  v_renewal_start timestamptz;
BEGIN
  SELECT settings INTO v_settings FROM public.platform_settings WHERE id=1;
  SELECT * INTO v_order FROM public.payment_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found'; END IF;
  IF v_order.status='confirmed' THEN
    RETURN jsonb_build_object('alreadyConfirmed',true,'status','confirmed','orderId',v_order.id);
  END IF;
  IF v_order.status NOT IN ('initiated','pending') THEN
    RAISE EXCEPTION 'Payment order cannot be confirmed from status %',v_order.status;
  END IF;

  v_kind := lower(COALESCE(v_order.metadata->>'paymentKind',v_order.metadata->>'kind','membership_upgrade'));
  v_tier := COALESCE(v_order.metadata->>'requestedTier','basic');
  IF v_tier NOT IN ('basic','premium','vip') THEN v_tier := 'basic'; END IF;

  UPDATE public.payment_orders SET status='confirmed',updated_at=now() WHERE id=v_order.id;

  IF v_kind='membership_upgrade' THEN
    UPDATE public.profiles SET tier=v_tier,updated_at=now() WHERE user_id=v_order.user_id;

    SELECT referred_by INTO v_direct FROM public.profiles WHERE user_id=v_order.user_id;
    IF v_direct IS NOT NULL THEN
      SELECT tier INTO v_direct_tier FROM public.profiles WHERE user_id=v_direct;
      v_tier_rates := COALESCE(v_settings->'referralRatesByTier'->COALESCE(v_direct_tier,'basic'),'{}'::jsonb);
      v_direct_rate := COALESCE((v_tier_rates->>'direct')::numeric,(v_settings->'referralRates'->>'direct')::numeric,0.10);
      v_indirect_rate := COALESCE((v_tier_rates->>'indirect')::numeric,(v_settings->'referralRates'->>'indirect')::numeric,0.05);
      v_direct_amount := round(v_order.amount*v_direct_rate,2);

      IF v_direct_amount>0 THEN
        INSERT INTO public.referral_earnings(beneficiary_user_id,referred_user_id,payment_order_id,relationship_level,rate,amount,currency)
        VALUES(v_direct,v_order.user_id,v_order.id,1,v_direct_rate,v_direct_amount,v_order.currency)
        ON CONFLICT (beneficiary_user_id,payment_order_id,relationship_level) DO NOTHING
        RETURNING id INTO v_direct_earning_id;
        IF v_direct_earning_id IS NOT NULL THEN
          INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
          VALUES(v_direct,0,0,v_order.currency)
          ON CONFLICT(user_id) DO NOTHING;
          SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=v_direct FOR UPDATE;
          UPDATE public.cash_wallet SET available_balance=available_balance+v_direct_amount,currency=v_order.currency,updated_at=now() WHERE user_id=v_direct;
          INSERT INTO public.cash_wallet_ledger(user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
          VALUES(v_direct,v_order.id,v_direct_amount,'CREDIT',v_order.currency,v_wallet.available_balance+v_direct_amount,'DIRECT_REFERRAL_EARNING',v_order.reference)
          ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;
        END IF;
      END IF;

      SELECT referred_by INTO v_indirect FROM public.profiles WHERE user_id=v_direct;
      IF v_indirect IS NOT NULL THEN
        SELECT tier INTO v_indirect_tier FROM public.profiles WHERE user_id=v_indirect;
        v_tier_rates := COALESCE(v_settings->'referralRatesByTier'->COALESCE(v_indirect_tier,'basic'),'{}'::jsonb);
        v_indirect_rate := COALESCE((v_tier_rates->>'indirect')::numeric,(v_settings->'referralRates'->>'indirect')::numeric,0.05);
        v_indirect_amount := round(v_order.amount*v_indirect_rate,2);
        IF v_indirect_amount>0 THEN
          INSERT INTO public.referral_earnings(beneficiary_user_id,referred_user_id,payment_order_id,relationship_level,rate,amount,currency)
          VALUES(v_indirect,v_order.user_id,v_order.id,2,v_indirect_rate,v_indirect_amount,v_order.currency)
          ON CONFLICT(beneficiary_user_id,payment_order_id,relationship_level) DO NOTHING
          RETURNING id INTO v_indirect_earning_id;
          IF v_indirect_earning_id IS NOT NULL THEN
            INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
            VALUES(v_indirect,0,0,v_order.currency)
            ON CONFLICT(user_id) DO NOTHING;
            SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=v_indirect FOR UPDATE;
            UPDATE public.cash_wallet SET available_balance=available_balance+v_indirect_amount,currency=v_order.currency,updated_at=now() WHERE user_id=v_indirect;
            INSERT INTO public.cash_wallet_ledger(user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
            VALUES(v_indirect,v_order.id,v_indirect_amount,'CREDIT',v_order.currency,v_wallet.available_balance+v_indirect_amount,'INDIRECT_REFERRAL_EARNING',v_order.reference)
            ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;
          END IF;
        END IF;
      END IF;
    END IF;

  ELSIF v_kind='wallet_deposit' THEN
    INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
    VALUES(v_order.user_id,0,0,v_order.currency)
    ON CONFLICT(user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=v_order.user_id FOR UPDATE;
    UPDATE public.cash_wallet SET available_balance=available_balance+v_order.amount,currency=v_order.currency,updated_at=now() WHERE user_id=v_order.user_id;
    INSERT INTO public.cash_wallet_ledger(user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
    VALUES(v_order.user_id,v_order.id,v_order.amount,'CREDIT',v_order.currency,v_wallet.available_balance+v_order.amount,'WALLET_DEPOSIT',v_order.reference)
    ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

  ELSIF v_kind='qc_recharge' THEN
    v_qc_amount := COALESCE((v_order.metadata->>'qcAmount')::numeric, NULL);
    IF v_qc_amount IS NULL OR v_qc_amount <= 0 THEN
      RAISE EXCEPTION 'QC amount is missing from the payment order.';
    END IF;
    INSERT INTO public.qc_wallet(user_id,balance) VALUES(v_order.user_id,0)
    ON CONFLICT(user_id) DO NOTHING;
    SELECT balance INTO v_qc_balance FROM public.qc_wallet WHERE user_id=v_order.user_id FOR UPDATE;
    v_qc_after := v_qc_balance + v_qc_amount;
    UPDATE public.qc_wallet SET balance=v_qc_after,updated_at=now() WHERE user_id=v_order.user_id;
    INSERT INTO public.qc_ledger(user_id,transaction_type,amount,direction,balance_after,reference_type,reference_id,description,status,metadata)
    VALUES(v_order.user_id,'qc_recharge',v_qc_amount,'IN',v_qc_after,'payment',v_order.id::text,'QC recharge','COMPLETED',jsonb_build_object('paymentOrderId',v_order.id,'paymentAmount',v_order.amount,'currency',v_order.currency));

  ELSIF v_kind='subscription_renewal' THEN
    -- Renewals are chained after the user's latest active membership period,
    -- preventing overlapping paid periods while preserving one commission event
    -- for each successful renewal payment.
    SELECT expires_at
      INTO v_renewal_start
    FROM public.subscriptions
    WHERE user_id = v_order.user_id
      AND status = 'active'
      AND expires_at > now()
    ORDER BY expires_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_renewal_start IS NULL THEN
      v_renewal_start := now();
    END IF;

    INSERT INTO public.subscriptions(user_id,tier,status,started_at,expires_at,amount,currency)
    VALUES(v_order.user_id,v_tier,'active',v_renewal_start,v_renewal_start+interval '30 days',v_order.amount,v_order.currency)
    RETURNING id INTO v_subscription_id;

  ELSIF v_kind='vip_content_subscription' THEN
    v_vip_user_id := NULLIF(v_order.metadata->>'vipUserId','')::uuid;
    IF v_vip_user_id IS NULL THEN
      RAISE EXCEPTION 'VIP content owner is missing from the payment order.';
    END IF;
    SELECT public.create_vip_content_subscription_atomic(
      v_order.id,
      v_order.user_id,
      v_vip_user_id,
      v_order.amount,
      v_order.currency
    ) INTO v_vip_subscription;

    -- Creator-content revenue is separate from membership/referral earnings.
    -- No platform deduction is invented here; CEO pricing can configure it later.
    INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
    VALUES(v_vip_user_id,0,0,v_order.currency)
    ON CONFLICT(user_id) DO NOTHING;

    SELECT * INTO v_vip_wallet
    FROM public.cash_wallet
    WHERE user_id=v_vip_user_id
    FOR UPDATE;

    UPDATE public.cash_wallet
    SET available_balance = available_balance + v_order.amount,
        currency = v_order.currency,
        updated_at = now()
    WHERE user_id=v_vip_user_id;

    INSERT INTO public.cash_wallet_ledger(
      user_id,payment_order_id,amount,direction,currency,balance_after,
      reference_type,reference_id
    )
    VALUES(
      v_vip_user_id,v_order.id,v_order.amount,'CREDIT',v_order.currency,
      v_vip_wallet.available_balance + v_order.amount,
      'VIP_CONTENT_SUBSCRIPTION_EARNING',v_order.id::text
    )
    ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

  ELSE
    RAISE EXCEPTION 'Unsupported payment kind: %',v_kind;
  END IF;

  RETURN jsonb_build_object(
    'alreadyConfirmed',false,'status','confirmed','paymentKind',v_kind,
    'currency',v_order.currency,'amount',v_order.amount,
    'upgradedTier',CASE WHEN v_kind='membership_upgrade' THEN v_tier ELSE NULL END,
    'subscriptionId',v_subscription_id,
    'qcAmount',CASE WHEN v_kind='qc_recharge' THEN v_qc_amount ELSE NULL END,
    'directReferralRate',v_direct_rate,'indirectReferralRate',v_indirect_rate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid) TO service_role;
