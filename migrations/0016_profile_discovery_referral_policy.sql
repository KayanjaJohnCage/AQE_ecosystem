ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer CHECK (age IS NULL OR age >= 18),
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS content_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS social_platforms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_methods jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS profiles_content_categories_idx ON public.profiles USING GIN (content_categories);
CREATE INDEX IF NOT EXISTS profiles_services_idx ON public.profiles USING GIN (services);
CREATE INDEX IF NOT EXISTS profiles_location_idx ON public.profiles (location);
CREATE INDEX IF NOT EXISTS profiles_gender_idx ON public.profiles (gender);
CREATE INDEX IF NOT EXISTS profiles_age_idx ON public.profiles (age);

-- Tier-aware referral policy: Basic/Premium retain the existing 10%/5% policy;
-- VIP earns 12% on both direct and indirect qualifying payments.
UPDATE public.platform_settings
SET settings = jsonb_set(
  jsonb_set(
    settings,
    '{referralRatesByTier}',
    '{"basic":{"direct":0.10,"indirect":0.05},"premium":{"direct":0.10,"indirect":0.05},"vip":{"direct":0.12,"indirect":0.12}}'::jsonb,
    true
  ),
  '{referralRates}',
  '{"direct":0.10,"indirect":0.05}'::jsonb,
  true
)
WHERE id = 1;

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
  v_wallet public.cash_wallet%ROWTYPE;
  v_tier text;
  v_direct uuid;
  v_indirect uuid;
  v_direct_earning_id uuid;
  v_indirect_earning_id uuid;
  v_direct_rate numeric := 0.10;
  v_indirect_rate numeric := 0.05;
  v_rates jsonb;
  v_tier_rates jsonb;
  v_direct_amount numeric;
  v_indirect_amount numeric;
BEGIN
  SELECT settings INTO v_rates FROM public.platform_settings WHERE id = 1;
  SELECT * INTO v_order FROM public.payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found'; END IF;
  IF v_order.status = 'confirmed' THEN RETURN jsonb_build_object('alreadyConfirmed', true, 'status', 'confirmed'); END IF;
  IF v_order.status NOT IN ('initiated','pending') THEN RAISE EXCEPTION 'Payment order cannot be confirmed from status %', v_order.status; END IF;

  v_tier := COALESCE(v_order.metadata->>'requestedTier', 'basic');
  IF v_tier NOT IN ('basic','premium','vip') THEN v_tier := 'basic'; END IF;
  v_tier_rates := COALESCE(v_rates->'referralRatesByTier'->v_tier, '{}'::jsonb);
  v_direct_rate := COALESCE((v_tier_rates->>'direct')::numeric, (v_rates->'referralRates'->>'direct')::numeric, 0.10);
  v_indirect_rate := COALESCE((v_tier_rates->>'indirect')::numeric, (v_rates->'referralRates'->>'indirect')::numeric, 0.05);
  IF v_direct_rate < 0 OR v_direct_rate > 1 OR v_indirect_rate < 0 OR v_indirect_rate > 1 THEN RAISE EXCEPTION 'Referral rates must be between 0 and 1'; END IF;

  UPDATE public.payment_orders SET status='confirmed', updated_at=now() WHERE id=v_order.id;
  INSERT INTO public.cash_wallet (user_id, available_balance, pending_balance, currency)
  VALUES (v_order.user_id, v_order.amount, 0, v_order.currency)
  ON CONFLICT (user_id) DO UPDATE SET available_balance=public.cash_wallet.available_balance+EXCLUDED.available_balance, currency=EXCLUDED.currency, updated_at=now()
  RETURNING * INTO v_wallet;
  INSERT INTO public.cash_wallet_ledger (user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
  VALUES (v_order.user_id,v_order.id,v_order.amount,'CREDIT',v_order.currency,v_wallet.available_balance,'PAYMENT_CONFIRMATION',v_order.reference)
  ON CONFLICT (user_id,payment_order_id,direction) DO NOTHING;
  UPDATE public.profiles SET tier=v_tier, updated_at=now() WHERE user_id=v_order.user_id;

  SELECT referred_by INTO v_direct FROM public.profiles WHERE user_id=v_order.user_id;
  IF v_direct IS NOT NULL THEN
    v_direct_amount := round(v_order.amount*v_direct_rate,2);
    INSERT INTO public.referral_earnings (beneficiary_user_id,referred_user_id,payment_order_id,relationship_level,rate,amount,currency)
    VALUES (v_direct,v_order.user_id,v_order.id,1,v_direct_rate,v_direct_amount,v_order.currency)
    ON CONFLICT (beneficiary_user_id,payment_order_id,relationship_level) DO NOTHING
    RETURNING id INTO v_direct_earning_id;
    IF v_direct_earning_id IS NOT NULL THEN
      INSERT INTO public.cash_wallet (user_id,available_balance,pending_balance,currency)
      VALUES (v_direct,v_direct_amount,0,v_order.currency)
      ON CONFLICT (user_id) DO UPDATE SET available_balance=public.cash_wallet.available_balance+EXCLUDED.available_balance,currency=EXCLUDED.currency,updated_at=now();
      INSERT INTO public.cash_wallet_ledger (user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
      SELECT v_direct,v_order.id,v_direct_amount,'CREDIT',v_order.currency,available_balance,'DIRECT_REFERRAL_EARNING',v_order.reference FROM public.cash_wallet WHERE user_id=v_direct
      ON CONFLICT (user_id,payment_order_id,direction) DO NOTHING;
    END IF;
    SELECT referred_by INTO v_indirect FROM public.profiles WHERE user_id=v_direct;
    IF v_indirect IS NOT NULL THEN
      v_indirect_amount := round(v_order.amount*v_indirect_rate,2);
      INSERT INTO public.referral_earnings (beneficiary_user_id,referred_user_id,payment_order_id,relationship_level,rate,amount,currency)
      VALUES (v_indirect,v_order.user_id,v_order.id,2,v_indirect_rate,v_indirect_amount,v_order.currency)
      ON CONFLICT (beneficiary_user_id,payment_order_id,relationship_level) DO NOTHING
      RETURNING id INTO v_indirect_earning_id;
      IF v_indirect_earning_id IS NOT NULL THEN
        INSERT INTO public.cash_wallet (user_id,available_balance,pending_balance,currency)
        VALUES (v_indirect,v_indirect_amount,0,v_order.currency)
        ON CONFLICT (user_id) DO UPDATE SET available_balance=public.cash_wallet.available_balance+EXCLUDED.available_balance,currency=EXCLUDED.currency,updated_at=now();
        INSERT INTO public.cash_wallet_ledger (user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
        SELECT v_indirect,v_order.id,v_indirect_amount,'CREDIT',v_order.currency,available_balance,'INDIRECT_REFERRAL_EARNING',v_order.reference FROM public.cash_wallet WHERE user_id=v_indirect
        ON CONFLICT (user_id,payment_order_id,direction) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('alreadyConfirmed',false,'status','confirmed','walletCredited',v_order.amount,'currency',v_order.currency,'upgradedTier',v_tier,'directReferralRate',v_direct_rate,'indirectReferralRate',v_indirect_rate);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid) TO service_role;
