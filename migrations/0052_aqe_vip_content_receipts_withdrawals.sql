-- AQE FINAL SYSTEM COMPLETION
-- Completes VIP creator-content subscriptions, receipt coverage and
-- database-bound withdrawal processing after 0051 reconciliation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- VIP creator-content schema and subscriber-only media access.
CREATE TABLE IF NOT EXISTS public.vip_content_settings (
  vip_user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  monthly_price numeric NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  currency text NOT NULL DEFAULT 'UGX' CHECK (char_length(currency)=3),
  title text NOT NULL DEFAULT 'VIP Content',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_content_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id uuid NOT NULL,
  vip_user_id uuid NOT NULL,
  payment_order_id uuid UNIQUE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'UGX' CHECK (char_length(currency)=3),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vip_content_subscriber_not_owner CHECK (subscriber_user_id <> vip_user_id)
);

ALTER TABLE public.vip_content_subscriptions
  ADD COLUMN IF NOT EXISTS payment_order_id uuid,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.profile_media
  ADD COLUMN IF NOT EXISTS content_access text NOT NULL DEFAULT 'public';

CREATE INDEX IF NOT EXISTS vip_content_subscriber_idx
  ON public.vip_content_subscriptions(subscriber_user_id,status,expires_at DESC);
CREATE INDEX IF NOT EXISTS vip_content_owner_idx
  ON public.vip_content_subscriptions(vip_user_id,status,expires_at DESC);
CREATE INDEX IF NOT EXISTS profile_media_content_access_idx
  ON public.profile_media(owner_user_id,content_access,moderation_status,visibility);

ALTER TABLE public.vip_content_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_content_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_content_settings_public_select ON public.vip_content_settings;
CREATE POLICY vip_content_settings_public_select
ON public.vip_content_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS vip_content_settings_owner_insert ON public.vip_content_settings;
CREATE POLICY vip_content_settings_owner_insert
ON public.vip_content_settings FOR INSERT
WITH CHECK (vip_user_id=auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS vip_content_settings_owner_update ON public.vip_content_settings;
CREATE POLICY vip_content_settings_owner_update
ON public.vip_content_settings FOR UPDATE
USING (vip_user_id=auth.uid() OR public.is_aqe_manager())
WITH CHECK (vip_user_id=auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS vip_content_settings_owner_delete ON public.vip_content_settings;
CREATE POLICY vip_content_settings_owner_delete
ON public.vip_content_settings FOR DELETE
USING (vip_user_id=auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS vip_content_subscriptions_owner_select ON public.vip_content_subscriptions;
CREATE POLICY vip_content_subscriptions_owner_select
ON public.vip_content_subscriptions FOR SELECT
USING (subscriber_user_id=auth.uid() OR vip_user_id=auth.uid() OR public.is_aqe_manager());

CREATE OR REPLACE FUNCTION public.has_active_vip_content_subscription(
  p_subscriber_user_id uuid,p_vip_user_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.vip_content_subscriptions
    WHERE subscriber_user_id=p_subscriber_user_id
      AND vip_user_id=p_vip_user_id
      AND status='active'
      AND expires_at>now()
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_vip_content_subscription(uuid,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_vip_content_subscription(uuid,uuid)
TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_vip_content_subscription_atomic(
  p_order_id uuid,p_subscriber_user_id uuid,p_vip_user_id uuid,
  p_amount numeric,p_currency text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_existing public.vip_content_subscriptions%ROWTYPE;
  v_subscription public.vip_content_subscriptions%ROWTYPE;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_subscriber_user_id=p_vip_user_id THEN
    RAISE EXCEPTION 'A VIP cannot subscribe to their own content.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.profiles WHERE user_id=p_vip_user_id AND tier='vip'
  ) THEN
    RAISE EXCEPTION 'Content subscriptions are only available for VIP profiles.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.vip_content_settings
    WHERE vip_user_id=p_vip_user_id AND enabled=true
      AND monthly_price=p_amount AND currency=p_currency
  ) THEN
    RAISE EXCEPTION 'The VIP content subscription price is no longer available.';
  END IF;

  SELECT * INTO v_existing
  FROM public.vip_content_subscriptions
  WHERE payment_order_id=p_order_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyCreated',true,'subscriptionId',v_existing.id,
      'vipUserId',v_existing.vip_user_id,'expiresAt',v_existing.expires_at,
      'status',v_existing.status
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.vip_content_subscriptions
  WHERE subscriber_user_id=p_subscriber_user_id
    AND vip_user_id=p_vip_user_id
    AND status='active'
    AND expires_at>now()
  ORDER BY expires_at DESC
  LIMIT 1
  FOR UPDATE;

  v_start:=CASE WHEN v_existing.id IS NOT NULL THEN v_existing.expires_at ELSE now() END;
  v_end:=v_start+interval '1 month';

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.vip_content_subscriptions
    SET expires_at=v_end,updated_at=now(),payment_order_id=p_order_id,
        amount=p_amount,currency=p_currency,status='active'
    WHERE id=v_existing.id
    RETURNING * INTO v_subscription;
  ELSE
    INSERT INTO public.vip_content_subscriptions(
      subscriber_user_id,vip_user_id,payment_order_id,amount,currency,
      status,starts_at,expires_at
    ) VALUES(
      p_subscriber_user_id,p_vip_user_id,p_order_id,p_amount,p_currency,
      'active',v_start,v_end
    ) RETURNING * INTO v_subscription;
  END IF;

  RETURN jsonb_build_object(
    'alreadyCreated',false,'subscriptionId',v_subscription.id,
    'subscriberUserId',v_subscription.subscriber_user_id,
    'vipUserId',v_subscription.vip_user_id,'amount',v_subscription.amount,
    'currency',v_subscription.currency,'status',v_subscription.status,
    'startsAt',v_subscription.starts_at,'expiresAt',v_subscription.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vip_content_subscription_atomic(uuid,uuid,uuid,numeric,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_vip_content_subscription_atomic(uuid,uuid,uuid,numeric,text)
TO service_role;

-- Withdrawal request columns required by the application/RPC.
ALTER TABLE public.vip_withdrawal_requests
  ADD COLUMN IF NOT EXISTS tier text DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_account text,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS service_charge_rate numeric DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS service_charge_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric DEFAULT 0;

ALTER TABLE public.vip_withdrawal_requests
  ALTER COLUMN service_charge_rate SET DEFAULT 0.10;

UPDATE public.vip_withdrawal_requests
SET service_charge_rate=0.10,
    service_charge_amount=round(amount*0.10,2),
    net_amount=round(amount-(amount*0.10),2)
WHERE service_charge_amount=0 OR net_amount=0;

-- Final payment confirmation: membership, wallet, QC, renewal and VIP content
-- are separate payment kinds and each confirmation is idempotent.
CREATE OR REPLACE FUNCTION public.confirm_payment_order_atomic(
  p_order_id uuid,p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_kind text;
  v_tier text;
  v_settings jsonb;
  v_rates jsonb;
  v_direct uuid;
  v_indirect uuid;
  v_direct_tier text;
  v_indirect_tier text;
  v_direct_rate numeric:=0.10;
  v_indirect_rate numeric:=0.05;
  v_amount numeric;
  v_wallet public.cash_wallet%ROWTYPE;
  v_qc numeric;
  v_qc_after numeric;
  v_vip_user_id uuid;
  v_vip_wallet public.cash_wallet%ROWTYPE;
  v_subscription_id uuid;
  v_renewal_start timestamptz;
  v_receipt_id uuid;
BEGIN
  IF p_order_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Payment order and manager actor are required';
  END IF;

  SELECT * INTO v_order FROM public.payment_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found'; END IF;

  IF v_order.status='confirmed' THEN
    RETURN jsonb_build_object('alreadyConfirmed',true,'status','confirmed','orderId',v_order.id);
  END IF;

  IF v_order.status NOT IN('initiated','pending') THEN
    RAISE EXCEPTION 'Payment order cannot be confirmed from status %',v_order.status;
  END IF;

  v_kind:=lower(coalesce(v_order.metadata->>'paymentKind',v_order.metadata->>'kind','membership_upgrade'));
  v_tier:=lower(coalesce(v_order.metadata->>'requestedTier',v_order.metadata->>'requested_tier','basic'));
  IF v_tier NOT IN('basic','premium','vip') THEN v_tier:='basic'; END IF;

  SELECT settings INTO v_settings FROM public.platform_settings WHERE id=1;
  UPDATE public.payment_orders SET status='confirmed',updated_at=now() WHERE id=v_order.id;

  IF v_kind='membership_upgrade' THEN
    UPDATE public.profiles
    SET tier=v_tier,verification_status='approved',updated_at=now()
    WHERE user_id=v_order.user_id;

    SELECT referred_by INTO v_direct FROM public.profiles WHERE user_id=v_order.user_id;

    IF v_direct IS NOT NULL THEN
      SELECT tier INTO v_direct_tier FROM public.profiles WHERE user_id=v_direct;
      v_rates:=coalesce(v_settings->'referralRatesByTier'->coalesce(v_direct_tier,'basic'),'{}'::jsonb);
      v_direct_rate:=coalesce((v_rates->>'direct')::numeric,(v_settings->'referralRates'->>'direct')::numeric,
        CASE WHEN coalesce(v_direct_tier,'basic')='vip' THEN 0.12 ELSE 0.10 END);
      v_amount:=round(v_order.amount*v_direct_rate,2);

      IF v_amount>0 THEN
        INSERT INTO public.referral_earnings(
          beneficiary_user_id,referred_user_id,payment_order_id,relationship_level,rate,amount,currency
        ) VALUES(v_direct,v_order.user_id,v_order.id,1,v_direct_rate,v_amount,v_order.currency)
        ON CONFLICT(beneficiary_user_id,payment_order_id,relationship_level) DO NOTHING;

        IF FOUND THEN
          INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
          VALUES(v_direct,0,0,v_order.currency)
          ON CONFLICT(user_id) DO NOTHING;
          SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=v_direct FOR UPDATE;
          UPDATE public.cash_wallet
          SET available_balance=available_balance+v_amount,currency=v_order.currency,updated_at=now()
          WHERE user_id=v_direct;
          INSERT INTO public.cash_wallet_ledger(
            user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id
          ) VALUES(
            v_direct,v_order.id,v_amount,'CREDIT',v_order.currency,
            v_wallet.available_balance+v_amount,'DIRECT_REFERRAL_EARNING',v_order.reference
          ) ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;
        END IF;
      END IF;

      SELECT referred_by INTO v_indirect FROM public.profiles WHERE user_id=v_direct;

      IF v_indirect IS NOT NULL THEN
        SELECT tier INTO v_indirect_tier FROM public.profiles WHERE user_id=v_indirect;
        v_rates:=coalesce(v_settings->'referralRatesByTier'->coalesce(v_indirect_tier,'basic'),'{}'::jsonb);
        v_indirect_rate:=coalesce((v_rates->>'indirect')::numeric,(v_settings->'referralRates'->>'indirect')::numeric,
          CASE WHEN coalesce(v_indirect_tier,'basic')='vip' THEN 0.12 ELSE 0.05 END);
        v_amount:=round(v_order.amount*v_indirect_rate,2);

        IF v_amount>0 THEN
          INSERT INTO public.referral_earnings(
            beneficiary_user_id,referred_user_id,payment_order_id,relationship_level,rate,amount,currency
          ) VALUES(v_indirect,v_order.user_id,v_order.id,2,v_indirect_rate,v_amount,v_order.currency)
          ON CONFLICT(beneficiary_user_id,payment_order_id,relationship_level) DO NOTHING;

          IF FOUND THEN
            INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
            VALUES(v_indirect,0,0,v_order.currency)
            ON CONFLICT(user_id) DO NOTHING;
            SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=v_indirect FOR UPDATE;
            UPDATE public.cash_wallet
            SET available_balance=available_balance+v_amount,currency=v_order.currency,updated_at=now()
            WHERE user_id=v_indirect;
            INSERT INTO public.cash_wallet_ledger(
              user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id
            ) VALUES(
              v_indirect,v_order.id,v_amount,'CREDIT',v_order.currency,
              v_wallet.available_balance+v_amount,'INDIRECT_REFERRAL_EARNING',v_order.reference
            ) ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;
          END IF;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.transaction_receipts(
      receipt_number,user_id,transaction_type,source,reference_id,amount,currency,status,description,metadata
    ) VALUES(
      public.aqe_receipt_number(),v_order.user_id,'MEMBERSHIP_UPGRADE','membership_upgrade',
      v_order.id::text,v_order.amount,v_order.currency,'COMPLETED',
      'AQE membership tier payment confirmed',
      jsonb_build_object('tier',v_tier,'paymentOrderId',v_order.id)
    ) RETURNING id INTO v_receipt_id;

  ELSIF v_kind='wallet_deposit' THEN
    INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
    VALUES(v_order.user_id,0,0,v_order.currency)
    ON CONFLICT(user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=v_order.user_id FOR UPDATE;
    UPDATE public.cash_wallet
    SET available_balance=available_balance+v_order.amount,currency=v_order.currency,updated_at=now()
    WHERE user_id=v_order.user_id;
    INSERT INTO public.cash_wallet_ledger(
      user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id
    ) VALUES(
      v_order.user_id,v_order.id,v_order.amount,'CREDIT',v_order.currency,
      v_wallet.available_balance+v_order.amount,'WALLET_DEPOSIT',v_order.reference
    ) ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

  ELSIF v_kind='qc_recharge' THEN
    v_qc:=NULLIF(v_order.metadata->>'qcAmount','')::numeric;
    IF coalesce(v_qc,0)<=0 THEN RAISE EXCEPTION 'QC amount is missing from the payment order'; END IF;
    INSERT INTO public.qc_wallet(user_id,balance)
    VALUES(v_order.user_id,0) ON CONFLICT(user_id) DO NOTHING;
    SELECT balance INTO v_qc_after FROM public.qc_wallet WHERE user_id=v_order.user_id FOR UPDATE;
    v_qc_after:=coalesce(v_qc_after,0)+v_qc;
    UPDATE public.qc_wallet SET balance=v_qc_after,updated_at=now() WHERE user_id=v_order.user_id;
    INSERT INTO public.qc_ledger(
      user_id,transaction_type,amount,direction,balance_after,reference_type,reference_id,
      description,status,metadata
    ) VALUES(
      v_order.user_id,'qc_recharge',v_qc,'IN',v_qc_after,'payment',v_order.id::text,
      'QC recharge','COMPLETED',
      jsonb_build_object('paymentOrderId',v_order.id,'paymentAmount',v_order.amount,'currency',v_order.currency)
    );

  ELSIF v_kind='subscription_renewal' THEN
    SELECT expires_at INTO v_renewal_start
    FROM public.subscriptions
    WHERE user_id=v_order.user_id AND status='active' AND expires_at>now()
    ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
    IF v_renewal_start IS NULL THEN v_renewal_start:=now(); END IF;

    INSERT INTO public.subscriptions(
      user_id,tier,status,started_at,expires_at,amount,currency
    ) VALUES(
      v_order.user_id,v_tier,'active',v_renewal_start,v_renewal_start+interval '30 days',
      v_order.amount,v_order.currency
    ) RETURNING id INTO v_subscription_id;

    UPDATE public.profiles
    SET tier=v_tier,verification_status='approved',updated_at=now()
    WHERE user_id=v_order.user_id;

  ELSIF v_kind='vip_content_subscription' THEN
    v_vip_user_id:=NULLIF(v_order.metadata->>'vipUserId','')::uuid;
    IF v_vip_user_id IS NULL THEN RAISE EXCEPTION 'VIP content owner is missing from the payment order'; END IF;

    PERFORM public.create_vip_content_subscription_atomic(
      v_order.id,v_order.user_id,v_vip_user_id,v_order.amount,v_order.currency
    );

    INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
    VALUES(v_vip_user_id,0,0,v_order.currency)
    ON CONFLICT(user_id) DO NOTHING;
    SELECT * INTO v_vip_wallet FROM public.cash_wallet WHERE user_id=v_vip_user_id FOR UPDATE;
    UPDATE public.cash_wallet
    SET available_balance=available_balance+v_order.amount,currency=v_order.currency,updated_at=now()
    WHERE user_id=v_vip_user_id;

    INSERT INTO public.cash_wallet_ledger(
      user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id
    ) VALUES(
      v_vip_user_id,v_order.id,v_order.amount,'CREDIT',v_order.currency,
      v_vip_wallet.available_balance+v_order.amount,'VIP_CONTENT_SUBSCRIPTION_EARNING',v_order.id::text
    ) ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

  ELSE
    RAISE EXCEPTION 'Unsupported payment kind: %',v_kind;
  END IF;

  RETURN jsonb_build_object(
    'alreadyConfirmed',false,'status','confirmed','paymentKind',v_kind,
    'currency',v_order.currency,'amount',v_order.amount,
    'upgradedTier',CASE WHEN v_kind IN('membership_upgrade','subscription_renewal') THEN v_tier ELSE NULL END,
    'subscriptionId',v_subscription_id,'qcAmount',CASE WHEN v_kind='qc_recharge' THEN v_qc ELSE NULL END,
    'receiptId',v_receipt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid) TO service_role;

-- Receipt coverage for all cash/QC movements, plus membership subscriptions.
CREATE OR REPLACE FUNCTION public.aqe_ledger_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  v_before numeric;
BEGIN
  IF TG_TABLE_NAME='qc_ledger' THEN
    v_before:=CASE WHEN NEW.direction='IN' THEN NEW.balance_after-NEW.amount ELSE NEW.balance_after+NEW.amount END;
    INSERT INTO public.transaction_receipts(
      receipt_number,user_id,transaction_type,source,reference_id,amount,qc_amount,
      balance_before,balance_after,status,description,metadata
    ) VALUES(
      public.aqe_receipt_number(),NEW.user_id,upper(NEW.transaction_type),'qc_ledger',
      NEW.reference_id,NEW.amount,
      CASE WHEN NEW.direction='IN' THEN NEW.amount ELSE -NEW.amount END,
      v_before,NEW.balance_after,
      CASE WHEN NEW.status='FAILED' THEN 'FAILED' ELSE 'COMPLETED' END,
      NEW.description,coalesce(NEW.metadata,'{}'::jsonb)
    );
  ELSE
    v_before:=CASE WHEN NEW.direction='CREDIT' THEN NEW.balance_after-NEW.amount ELSE NEW.balance_after+NEW.amount END;
    INSERT INTO public.transaction_receipts(
      receipt_number,user_id,transaction_type,source,reference_id,amount,cash_amount,
      currency,balance_before,balance_after,status,description,metadata
    ) VALUES(
      public.aqe_receipt_number(),NEW.user_id,upper(NEW.reference_type),'cash_ledger',
      NEW.reference_id,NEW.amount,
      CASE WHEN NEW.direction='CREDIT' THEN NEW.amount ELSE -NEW.amount END,
      NEW.currency,v_before,NEW.balance_after,'COMPLETED',
      NEW.reference_type,jsonb_build_object('direction',NEW.direction)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qc_ledger_receipt_trigger ON public.qc_ledger;
CREATE TRIGGER qc_ledger_receipt_trigger
AFTER INSERT ON public.qc_ledger FOR EACH ROW EXECUTE FUNCTION public.aqe_ledger_receipt();

DROP TRIGGER IF EXISTS cash_ledger_receipt_trigger ON public.cash_wallet_ledger;
CREATE TRIGGER cash_ledger_receipt_trigger
AFTER INSERT ON public.cash_wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.aqe_ledger_receipt();

CREATE OR REPLACE FUNCTION public.aqe_subscription_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.transaction_receipts(
    receipt_number,user_id,transaction_type,source,reference_id,amount,currency,status,description,metadata
  ) VALUES(
    public.aqe_receipt_number(),NEW.user_id,'SUBSCRIPTION','subscription',
    NEW.id::text,NEW.amount,NEW.currency,
    CASE WHEN NEW.status='active' THEN 'COMPLETED' ELSE 'PENDING' END,
    'Membership subscription',
    jsonb_build_object('tier',NEW.tier,'expiresAt',NEW.expires_at)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_receipt_trigger ON public.subscriptions;
CREATE TRIGGER subscription_receipt_trigger
AFTER INSERT ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.aqe_subscription_receipt();

-- VIP salary: only verified VIP profiles can receive the monthly salary.
CREATE OR REPLACE FUNCTION public.issue_vip_salary(
  p_user_id uuid,p_salary numeric,p_currency text DEFAULT 'UGX',p_period text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_period text:=coalesce(p_period,to_char(now() AT TIME ZONE 'Africa/Kampala','YYYY-MM'));
  v_existing public.vip_salary_payments%ROWTYPE;
  v_invites integer:=0;
  v_amount numeric:=0;
BEGIN
  IF p_salary IS NULL OR p_salary<0 THEN RAISE EXCEPTION 'Invalid VIP salary amount'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.profiles WHERE user_id=p_user_id AND tier='vip' AND verification_status='approved'
  ) THEN RAISE EXCEPTION 'Only verified VIP members can receive VIP salary'; END IF;

  SELECT * INTO v_existing FROM public.vip_salary_payments
  WHERE user_id=p_user_id AND period=v_period FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'alreadyPaid',true,'period',v_period,'amount',v_existing.amount);
  END IF;

  SELECT count(*) INTO v_invites FROM public.profiles WHERE referred_by=p_user_id;
  v_amount:=round(v_invites*p_salary,2);

  INSERT INTO public.vip_asset_rooms(user_id,salary_balance)
  VALUES(p_user_id,0) ON CONFLICT(user_id) DO NOTHING;
  UPDATE public.vip_asset_rooms
  SET salary_balance=salary_balance+v_amount,updated_at=now()
  WHERE user_id=p_user_id;

  INSERT INTO public.vip_salary_payments(user_id,period,invite_count,salary_per_invite,amount,currency,status)
  VALUES(p_user_id,v_period,v_invites,p_salary,v_amount,coalesce(nullif(p_currency,''),'UGX'),
    CASE WHEN v_amount>0 THEN 'credited' ELSE 'zero' END);

  RETURN jsonb_build_object('ok',true,'alreadyPaid',false,'period',v_period,
    'inviteCount',v_invites,'salaryPerInvite',p_salary,'amount',v_amount,'currency',coalesce(nullif(p_currency,''),'UGX'));
END;
$$;

REVOKE ALL ON FUNCTION public.issue_vip_salary(uuid,numeric,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vip_salary(uuid,numeric,text,text) TO service_role;

-- Atomic withdrawal reservation/finalization with the CEO 10% policy.
CREATE OR REPLACE FUNCTION public.request_cash_withdrawal_atomic(
  p_user_id uuid,p_amount numeric,p_tier text,p_payment_method text,
  p_recipient_name text,p_recipient_account text,p_currency text,p_service_charge_rate numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_profile_tier text;
  v_wallet public.cash_wallet%ROWTYPE;
  v_withdrawal public.vip_withdrawal_requests%ROWTYPE;
  v_last timestamptz;
  v_fee numeric;
  v_net numeric;
  v_date date:=(now() AT TIME ZONE 'Africa/Kampala')::date;
  v_invites integer:=0;
  v_cooldown integer:=24;
BEGIN
  SELECT tier INTO v_profile_tier FROM public.profiles WHERE user_id=p_user_id;
  IF v_profile_tier NOT IN('basic','premium','vip') THEN RAISE EXCEPTION 'A valid membership tier is required for withdrawals'; END IF;
  IF lower(coalesce(p_tier,''))<>v_profile_tier THEN RAISE EXCEPTION 'Withdrawal tier does not match the member profile'; END IF;
  IF p_currency<>'UGX' THEN RAISE EXCEPTION 'Withdrawals are processed in UGX'; END IF;
  IF p_amount<30000 THEN RAISE EXCEPTION 'Minimum withdrawal amount is UGX 30,000'; END IF;
  IF p_amount>5000000 THEN RAISE EXCEPTION 'Maximum withdrawal amount is UGX 5,000,000'; END IF;
  IF p_service_charge_rate<>0.10 THEN RAISE EXCEPTION 'Withdrawal service charge must be 10%%'; END IF;

  IF v_profile_tier IN('basic','premium') THEN
    SELECT count(*) INTO v_invites FROM public.profiles WHERE referred_by=p_user_id;
    IF v_invites<2 THEN RAISE EXCEPTION 'Basic and Premium members need at least 2 direct invites before withdrawing'; END IF;
  END IF;

  IF v_profile_tier='basic' AND extract(dow from v_date) NOT IN(0,6) THEN
    RAISE EXCEPTION 'Basic withdrawals are available on weekends only';
  END IF;

  v_cooldown:=CASE WHEN v_profile_tier='premium' THEN 48 ELSE 24 END;

  SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash wallet not found'; END IF;

  SELECT created_at INTO v_last FROM public.vip_withdrawal_requests
  WHERE user_id=p_user_id ORDER BY created_at DESC LIMIT 1;

  IF v_last IS NOT NULL AND now()<v_last+make_interval(hours=>v_cooldown) THEN
    RAISE EXCEPTION 'Withdrawal frequency limit reached. Please wait until the required interval has passed';
  END IF;

  IF v_wallet.currency<>p_currency THEN RAISE EXCEPTION 'Wallet currency does not match the withdrawal currency'; END IF;
  IF v_wallet.available_balance<p_amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  v_fee:=round(p_amount*0.10,2);
  v_net:=round(p_amount-v_fee,2);

  INSERT INTO public.vip_withdrawal_requests(
    user_id,tier,payment_method,recipient_name,recipient_account,currency,
    amount,service_charge_rate,service_charge_amount,net_amount,status
  ) VALUES(
    p_user_id,v_profile_tier,p_payment_method,trim(p_recipient_name),trim(p_recipient_account),
    p_currency,p_amount,0.10,v_fee,v_net,'PENDING'
  ) RETURNING * INTO v_withdrawal;

  UPDATE public.cash_wallet
  SET available_balance=available_balance-p_amount,
      pending_balance=pending_balance+p_amount,updated_at=now()
  WHERE user_id=p_user_id;

  INSERT INTO public.cash_wallet_ledger(
    user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id
  ) VALUES(
    p_user_id,v_withdrawal.id,p_amount,'DEBIT',p_currency,
    v_wallet.available_balance-p_amount,'WITHDRAWAL_RESERVATION',v_withdrawal.id::text
  );

  RETURN jsonb_build_object(
    'id',v_withdrawal.id,'userId',v_withdrawal.user_id,'tier',v_withdrawal.tier,
    'paymentMethod',v_withdrawal.payment_method,'recipientName',v_withdrawal.recipient_name,
    'recipientAccount',v_withdrawal.recipient_account,'currency',v_withdrawal.currency,
    'grossAmount',v_withdrawal.amount,'serviceChargeRate',v_withdrawal.service_charge_rate,
    'serviceChargeAmount',v_withdrawal.service_charge_amount,'netAmount',v_withdrawal.net_amount,
    'status',v_withdrawal.status,'createdAt',v_withdrawal.created_at,
    'directInviteCount',v_invites
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_cash_withdrawal_atomic(
  p_withdrawal_id uuid,p_status text,p_actor_id uuid,p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v public.vip_withdrawal_requests%ROWTYPE;
  w public.cash_wallet%ROWTYPE;
  l uuid;
  lw public.cash_wallet%ROWTYPE;
  refund boolean:=false;
  fee_credited numeric:=0;
  leader_after numeric;
BEGIN
  IF p_status NOT IN('APPROVED','REJECTED','PAID','CANCELLED') THEN RAISE EXCEPTION 'Invalid withdrawal decision'; END IF;

  SELECT * INTO v FROM public.vip_withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal request not found'; END IF;

  IF v.status='PENDING' AND p_status NOT IN('APPROVED','REJECTED','CANCELLED') THEN
    RAISE EXCEPTION 'Pending withdrawals must be approved, rejected, or cancelled';
  ELSIF v.status='APPROVED' AND p_status NOT IN('PAID','REJECTED','CANCELLED') THEN
    RAISE EXCEPTION 'Under-review withdrawals must be marked paid, rejected, or cancelled';
  ELSIF v.status NOT IN('PENDING','APPROVED') THEN
    RAISE EXCEPTION 'Withdrawal has already reached a final state';
  END IF;

  SELECT * INTO w FROM public.cash_wallet WHERE user_id=v.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash wallet not found'; END IF;
  IF w.pending_balance<v.amount THEN RAISE EXCEPTION 'Pending withdrawal balance is inconsistent'; END IF;

  refund:=p_status IN('REJECTED','CANCELLED');

  IF refund THEN
    UPDATE public.cash_wallet
    SET available_balance=available_balance+v.amount,
        pending_balance=pending_balance-v.amount,updated_at=now()
    WHERE user_id=v.user_id;
    INSERT INTO public.cash_wallet_ledger(
      user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id
    ) VALUES(
      v.user_id,v.id,v.amount,'CREDIT',v.currency,
      w.available_balance+v.amount,'WITHDRAWAL_REFUND',v.id::text
    ) ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

  ELSIF p_status='PAID' THEN
    UPDATE public.cash_wallet
    SET pending_balance=pending_balance-v.amount,updated_at=now()
    WHERE user_id=v.user_id;

    SELECT referred_by INTO l FROM public.profiles WHERE user_id=v.user_id;

    IF l IS NOT NULL AND l<>v.user_id AND v.service_charge_amount>0 THEN
      INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
      VALUES(l,0,0,v.currency) ON CONFLICT(user_id) DO NOTHING;
      SELECT * INTO lw FROM public.cash_wallet WHERE user_id=l FOR UPDATE;

      IF NOT EXISTS(
        SELECT 1 FROM public.cash_wallet_ledger
        WHERE user_id=l AND reference_type='TEAM_LEADER_WITHDRAWAL_FEE'
          AND reference_id=v.id::text
      ) THEN
        leader_after:=lw.available_balance+v.service_charge_amount;
        UPDATE public.cash_wallet
        SET available_balance=leader_after,updated_at=now() WHERE user_id=l;
        INSERT INTO public.cash_wallet_ledger(
          user_id,payment_order_id,amount,direction,currency,balance_after,
          reference_type,reference_id
        ) VALUES(
          l,v.id,v.service_charge_amount,'CREDIT',v.currency,leader_after,
          'TEAM_LEADER_WITHDRAWAL_FEE',v.id::text
        );
        fee_credited:=v.service_charge_amount;
      END IF;
    END IF;
  END IF;

  UPDATE public.vip_withdrawal_requests
  SET status=p_status,reviewed_at=now(),reviewed_by=p_actor_id,
      review_reason=NULLIF(trim(coalesce(p_reason,'')),'')
  WHERE id=p_withdrawal_id;

  RETURN jsonb_build_object(
    'ok',true,'status',p_status,'refunded',refund,
    'grossAmount',v.amount,'serviceChargeAmount',v.service_charge_amount,
    'netAmount',v.net_amount,'teamLeaderFeeCredited',fee_credited
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric)
TO service_role;

REVOKE ALL ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text)
TO service_role;

-- VIP content media access policy.
DROP POLICY IF EXISTS profile_media_select_public_or_owner ON public.profile_media;
CREATE POLICY profile_media_select_public_or_owner
ON public.profile_media FOR SELECT
USING(
  owner_user_id=auth.uid()
  OR public.is_aqe_manager()
  OR (
    visibility='public' AND moderation_status='approved'
    AND (
      content_access='public'
      OR public.has_active_vip_content_subscription(auth.uid(),owner_user_id)
    )
  )
);

NOTIFY pgrst,'reload schema';

SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
AND table_name IN(
  'vip_content_settings','vip_content_subscriptions','transaction_receipts',
  'profile_media','vip_withdrawal_requests','vip_salary_payments',
  'vip_asset_rooms','vip_asset_room_sessions'
)
ORDER BY table_name;