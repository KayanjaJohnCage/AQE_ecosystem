-- VIP creator-content subscriptions are separate from AQE membership/tier subscriptions.
-- A subscriber pays an individual VIP's configured monthly content price to unlock
-- that VIP's subscriber-only media for one month.

CREATE TABLE IF NOT EXISTS public.vip_content_settings (
  vip_user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  monthly_price numeric NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  currency text NOT NULL DEFAULT 'UGX' CHECK (char_length(currency) = 3),
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
  currency text NOT NULL DEFAULT 'UGX' CHECK (char_length(currency) = 3),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','cancelled')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vip_content_subscriber_not_owner CHECK (subscriber_user_id <> vip_user_id)
);

CREATE INDEX IF NOT EXISTS vip_content_subscriber_idx
  ON public.vip_content_subscriptions(subscriber_user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS vip_content_owner_idx
  ON public.vip_content_subscriptions(vip_user_id, status, expires_at DESC);

ALTER TABLE public.profile_media
  ADD COLUMN IF NOT EXISTS content_access text NOT NULL DEFAULT 'public'
  CHECK (content_access IN ('public','subscribers_only'));

CREATE INDEX IF NOT EXISTS profile_media_content_access_idx
  ON public.profile_media(owner_user_id, content_access, moderation_status, visibility);

ALTER TABLE public.vip_content_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_content_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_content_settings_public_select ON public.vip_content_settings;
CREATE POLICY vip_content_settings_public_select
  ON public.vip_content_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS vip_content_settings_owner_insert ON public.vip_content_settings;
CREATE POLICY vip_content_settings_owner_insert
  ON public.vip_content_settings FOR INSERT
  WITH CHECK (vip_user_id = auth.uid() AND public.is_aqe_manager() IS FALSE);

DROP POLICY IF EXISTS vip_content_settings_owner_update ON public.vip_content_settings;
CREATE POLICY vip_content_settings_owner_update
  ON public.vip_content_settings FOR UPDATE
  USING (vip_user_id = auth.uid() OR public.is_aqe_manager())
  WITH CHECK (vip_user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS vip_content_settings_owner_delete ON public.vip_content_settings;
CREATE POLICY vip_content_settings_owner_delete
  ON public.vip_content_settings FOR DELETE
  USING (vip_user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS vip_content_subscriptions_owner_select ON public.vip_content_subscriptions;
CREATE POLICY vip_content_subscriptions_owner_select
  ON public.vip_content_subscriptions FOR SELECT
  USING (
    subscriber_user_id = auth.uid()
    OR vip_user_id = auth.uid()
    OR public.is_aqe_manager()
  );

CREATE OR REPLACE FUNCTION public.has_active_vip_content_subscription(
  p_subscriber_user_id uuid,
  p_vip_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vip_content_subscriptions s
    WHERE s.subscriber_user_id = p_subscriber_user_id
      AND s.vip_user_id = p_vip_user_id
      AND s.status = 'active'
      AND s.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.create_vip_content_subscription_atomic(
  p_order_id uuid,
  p_subscriber_user_id uuid,
  p_vip_user_id uuid,
  p_amount numeric,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.vip_content_subscriptions%ROWTYPE;
  v_subscription public.vip_content_subscriptions%ROWTYPE;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_subscriber_user_id = p_vip_user_id THEN
    RAISE EXCEPTION 'A VIP cannot subscribe to their own content.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_vip_user_id AND tier = 'vip'
  ) THEN
    RAISE EXCEPTION 'Content subscriptions are only available for VIP profiles.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vip_content_settings
    WHERE vip_user_id = p_vip_user_id
      AND enabled = true
      AND monthly_price = p_amount
      AND currency = p_currency
  ) THEN
    RAISE EXCEPTION 'The VIP content subscription price is no longer available.';
  END IF;

  SELECT * INTO v_existing
  FROM public.vip_content_subscriptions
  WHERE payment_order_id = p_order_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyCreated', true,
      'subscriptionId', v_existing.id,
      'vipUserId', v_existing.vip_user_id,
      'expiresAt', v_existing.expires_at,
      'status', v_existing.status
    );
  END IF;

  SELECT *
  INTO v_existing
  FROM public.vip_content_subscriptions
  WHERE subscriber_user_id = p_subscriber_user_id
    AND vip_user_id = p_vip_user_id
    AND status = 'active'
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1
  FOR UPDATE;

  v_start := CASE
    WHEN v_existing.id IS NOT NULL THEN v_existing.expires_at
    ELSE now()
  END;
  v_end := v_start + interval '1 month';

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.vip_content_subscriptions
    SET expires_at = v_end, updated_at = now(), payment_order_id = p_order_id,
        amount = p_amount, currency = p_currency, status = 'active'
    WHERE id = v_existing.id
    RETURNING * INTO v_subscription;
  ELSE
    INSERT INTO public.vip_content_subscriptions(
      subscriber_user_id, vip_user_id, payment_order_id, amount, currency,
      status, starts_at, expires_at
    )
    VALUES(
      p_subscriber_user_id, p_vip_user_id, p_order_id, p_amount, p_currency,
      'active', v_start, v_end
    )
    RETURNING * INTO v_subscription;
  END IF;

  RETURN jsonb_build_object(
    'alreadyCreated', false,
    'subscriptionId', v_subscription.id,
    'subscriberUserId', v_subscription.subscriber_user_id,
    'vipUserId', v_subscription.vip_user_id,
    'amount', v_subscription.amount,
    'currency', v_subscription.currency,
    'status', v_subscription.status,
    'startsAt', v_subscription.starts_at,
    'expiresAt', v_subscription.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_active_vip_content_subscription(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_vip_content_subscription(uuid,uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_vip_content_subscription_atomic(uuid,uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vip_content_subscription_atomic(uuid,uuid,uuid,numeric,text) TO service_role;

-- Enforce the CEO VIP withdrawal restriction at the database boundary as well.
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
  v_fee numeric;
  v_net numeric;
  v_kampala_date date := (now() AT TIME ZONE 'Africa/Kampala')::date;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero.';
  END IF;

  IF p_service_charge_rate IS NULL OR p_service_charge_rate < 0 OR p_service_charge_rate > 1 THEN
    RAISE EXCEPTION 'Invalid withdrawal service charge.';
  END IF;

  IF lower(COALESCE(p_tier, '')) = 'vip'
     AND EXTRACT(DAY FROM v_kampala_date) < 20 THEN
    RAISE EXCEPTION 'VIP earnings cannot be withdrawn before the 20th of the month.';
  END IF;

  SELECT * INTO v_wallet
  FROM public.cash_wallet
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash wallet not found.';
  END IF;

  IF v_wallet.currency <> p_currency THEN
    RAISE EXCEPTION 'Wallet currency does not match the withdrawal currency.';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance.';
  END IF;

  v_fee := round(p_amount * p_service_charge_rate, 2);
  v_net := round(p_amount - v_fee, 2);

  INSERT INTO public.vip_withdrawal_requests (
    user_id, tier, payment_method, recipient_name, recipient_account,
    currency, amount, service_charge_rate, service_charge_amount, net_amount, status
  )
  VALUES (
    p_user_id, p_tier, p_payment_method, trim(p_recipient_name),
    trim(p_recipient_account), p_currency, p_amount, p_service_charge_rate,
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
    'id', v_withdrawal.id, 'userId', v_withdrawal.user_id,
    'tier', v_withdrawal.tier, 'paymentMethod', v_withdrawal.payment_method,
    'recipientName', v_withdrawal.recipient_name,
    'recipientAccount', v_withdrawal.recipient_account,
    'currency', v_withdrawal.currency, 'grossAmount', v_withdrawal.amount,
    'serviceChargeRate', v_withdrawal.service_charge_rate,
    'serviceChargeAmount', v_withdrawal.service_charge_amount,
    'netAmount', v_withdrawal.net_amount, 'status', v_withdrawal.status,
    'createdAt', v_withdrawal.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) TO service_role;
