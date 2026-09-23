-- Atomic cash withdrawal reservation/finalization and profile media records.

CREATE TABLE IF NOT EXISTS public.profile_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  is_profile_photo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_media_owner_idx
  ON public.profile_media(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_media_public_idx
  ON public.profile_media(owner_user_id, moderation_status, visibility);

ALTER TABLE public.profile_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_media_select_public_or_owner ON public.profile_media;
CREATE POLICY profile_media_select_public_or_owner
  ON public.profile_media FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR public.is_aqe_manager()
    OR (visibility = 'public' AND moderation_status = 'approved')
  );

DROP POLICY IF EXISTS profile_media_update_owner_or_manager ON public.profile_media;
CREATE POLICY profile_media_update_owner_or_manager
  ON public.profile_media FOR UPDATE
  USING (owner_user_id = auth.uid() OR public.is_aqe_manager())
  WITH CHECK (owner_user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS profile_media_delete_owner_or_manager ON public.profile_media;
CREATE POLICY profile_media_delete_owner_or_manager
  ON public.profile_media FOR DELETE
  USING (owner_user_id = auth.uid() OR public.is_aqe_manager());

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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero.';
  END IF;

  IF p_service_charge_rate IS NULL OR p_service_charge_rate < 0 OR p_service_charge_rate > 1 THEN
    RAISE EXCEPTION 'Invalid withdrawal service charge.';
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
    user_id,
    tier,
    payment_method,
    recipient_name,
    recipient_account,
    currency,
    amount,
    service_charge_rate,
    service_charge_amount,
    net_amount,
    status
  )
  VALUES (
    p_user_id,
    p_tier,
    p_payment_method,
    trim(p_recipient_name),
    trim(p_recipient_account),
    p_currency,
    p_amount,
    p_service_charge_rate,
    v_fee,
    v_net,
    'PENDING'
  )
  RETURNING * INTO v_withdrawal;

  UPDATE public.cash_wallet
  SET
    available_balance = available_balance - p_amount,
    pending_balance = pending_balance + p_amount,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.cash_wallet_ledger (
    user_id,
    payment_order_id,
    amount,
    direction,
    currency,
    balance_after,
    reference_type,
    reference_id
  )
  VALUES (
    p_user_id,
    v_withdrawal.id,
    p_amount,
    'DEBIT',
    p_currency,
    v_wallet.available_balance - p_amount,
    'WITHDRAWAL_RESERVATION',
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
    'createdAt', v_withdrawal.created_at
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
  v_refund boolean := false;
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
    SET
      available_balance = available_balance + v_withdrawal.amount,
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
    );
  ELSIF p_status = 'PAID' THEN
    UPDATE public.cash_wallet
    SET
      pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = now()
    WHERE user_id = v_withdrawal.user_id;
  END IF;

  UPDATE public.vip_withdrawal_requests
  SET
    status = p_status,
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
    'netAmount', v_withdrawal.net_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_cash_withdrawal_atomic(uuid,numeric,text,text,text,text,text,numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_cash_withdrawal_atomic(uuid,text,uuid,text) TO service_role;
