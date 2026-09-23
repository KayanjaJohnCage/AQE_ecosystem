-- Central receipts/proof, campaigns, codes and gift packages.
-- All reward-bearing campaign actions are persisted and auditable.

CREATE TABLE IF NOT EXISTS public.transaction_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  transaction_type text NOT NULL,
  source text NOT NULL,
  reference_id text,
  amount numeric(12,2),
  currency text,
  qc_amount numeric(12,2),
  cash_amount numeric(12,2),
  boost_days integer,
  balance_before numeric(12,2),
  balance_after numeric(12,2),
  status text NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('PENDING','COMPLETED','FAILED','REVERSED','CANCELLED')),
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_receipts_user_idx
  ON public.transaction_receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transaction_receipts_reference_idx
  ON public.transaction_receipts(reference_id);

ALTER TABLE public.transaction_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transaction_receipts_select_own_or_manager ON public.transaction_receipts;
CREATE POLICY transaction_receipts_select_own_or_manager
  ON public.transaction_receipts FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

CREATE OR REPLACE FUNCTION public.aqe_receipt_number()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'AQE-' || to_char(now() AT TIME ZONE 'Africa/Kampala', 'YYYYMMDDHH24MISS') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
END;
$$;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','completed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  qc_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (qc_amount >= 0),
  cash_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  cash_currency text NOT NULL DEFAULT 'UGX' CHECK (char_length(cash_currency) = 3),
  boost_days integer NOT NULL DEFAULT 0 CHECK (boost_days >= 0 AND boost_days <= 365),
  boost_label text,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  uses_count integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  eligibility_tiers text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_gift_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  qc_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (qc_amount >= 0),
  cash_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  cash_currency text NOT NULL DEFAULT 'UGX' CHECK (char_length(cash_currency) = 3),
  boost_days integer NOT NULL DEFAULT 0 CHECK (boost_days >= 0 AND boost_days <= 365),
  boost_label text,
  quantity integer CHECK (quantity IS NULL OR quantity > 0),
  claimed_count integer NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  eligibility_tiers text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  code_id uuid REFERENCES public.campaign_codes(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.campaign_gift_packages(id) ON DELETE SET NULL,
  qc_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_currency text,
  boost_days integer NOT NULL DEFAULT 0,
  receipt_id uuid REFERENCES public.transaction_receipts(id),
  status text NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('COMPLETED','FAILED','REVERSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((code_id IS NOT NULL) <> (package_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_code_user_once_idx
  ON public.campaign_redemptions(code_id, user_id)
  WHERE code_id IS NOT NULL AND status = 'COMPLETED';

CREATE UNIQUE INDEX IF NOT EXISTS campaign_package_user_once_idx
  ON public.campaign_redemptions(package_id, user_id)
  WHERE package_id IS NOT NULL AND status = 'COMPLETED';

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_gift_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_select_active_or_manager ON public.campaigns;
CREATE POLICY campaigns_select_active_or_manager ON public.campaigns FOR SELECT
USING (status = 'active' OR public.is_aqe_manager());
DROP POLICY IF EXISTS campaigns_manager_write ON public.campaigns;
CREATE POLICY campaigns_manager_write ON public.campaigns FOR ALL
USING (public.is_aqe_manager()) WITH CHECK (public.is_aqe_manager());

DROP POLICY IF EXISTS campaign_codes_select_active_or_manager ON public.campaign_codes;
CREATE POLICY campaign_codes_select_active_or_manager ON public.campaign_codes FOR SELECT
USING (active AND public.is_aqe_manager() OR active);
DROP POLICY IF EXISTS campaign_codes_manager_write ON public.campaign_codes;
CREATE POLICY campaign_codes_manager_write ON public.campaign_codes FOR ALL
USING (public.is_aqe_manager()) WITH CHECK (public.is_aqe_manager());

DROP POLICY IF EXISTS campaign_packages_select_active_or_manager ON public.campaign_gift_packages;
CREATE POLICY campaign_packages_select_active_or_manager ON public.campaign_gift_packages FOR SELECT
USING (active AND public.is_aqe_manager() OR active);
DROP POLICY IF EXISTS campaign_packages_manager_write ON public.campaign_gift_packages;
CREATE POLICY campaign_packages_manager_write ON public.campaign_gift_packages FOR ALL
USING (public.is_aqe_manager()) WITH CHECK (public.is_aqe_manager());

DROP POLICY IF EXISTS campaign_redemptions_select_own_or_manager ON public.campaign_redemptions;
CREATE POLICY campaign_redemptions_select_own_or_manager ON public.campaign_redemptions FOR SELECT
USING (user_id = auth.uid() OR public.is_aqe_manager());

CREATE OR REPLACE FUNCTION public.redeem_campaign_code(
  p_user_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code public.campaign_codes%ROWTYPE;
  v_campaign public.campaigns%ROWTYPE;
  v_tier text;
  v_qc_before numeric := 0;
  v_qc_after numeric := 0;
  v_cash_before numeric := 0;
  v_cash_after numeric := 0;
  v_receipt_id uuid;
  v_receipt_number text;
  v_redemption_id uuid;
  v_boost jsonb;
BEGIN
  SELECT * INTO v_code FROM public.campaign_codes
  WHERE upper(code) = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND OR NOT v_code.active THEN RAISE EXCEPTION 'Campaign code is invalid or inactive.'; END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = v_code.campaign_id FOR UPDATE;
  IF v_campaign.status <> 'active' OR
     (v_campaign.starts_at IS NOT NULL AND now() < v_campaign.starts_at) OR
     (v_campaign.ends_at IS NOT NULL AND now() > v_campaign.ends_at) OR
     (v_code.expires_at IS NOT NULL AND now() > v_code.expires_at) THEN
    RAISE EXCEPTION 'This campaign code is no longer available.';
  END IF;

  IF v_code.usage_limit IS NOT NULL AND v_code.uses_count >= v_code.usage_limit THEN
    RAISE EXCEPTION 'This campaign code has reached its usage limit.';
  END IF;

  SELECT tier INTO v_tier FROM public.profiles WHERE user_id = p_user_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'Profile not found.'; END IF;
  IF cardinality(v_code.eligibility_tiers) > 0 AND NOT (v_tier = ANY(v_code.eligibility_tiers)) THEN
    RAISE EXCEPTION 'You are not eligible for this campaign code.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.campaign_redemptions WHERE code_id = v_code.id AND user_id = p_user_id AND status = 'COMPLETED') THEN
    RAISE EXCEPTION 'You have already redeemed this campaign code.';
  END IF;

  IF v_code.qc_amount > 0 THEN
    INSERT INTO public.qc_wallet(user_id, balance) VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT balance INTO v_qc_before FROM public.qc_wallet WHERE user_id = p_user_id FOR UPDATE;
    v_qc_after := v_qc_before + v_code.qc_amount;
    UPDATE public.qc_wallet SET balance = v_qc_after, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.qc_ledger(user_id, transaction_type, amount, direction, balance_after, reference_type, reference_id, description, status, metadata)
    VALUES (p_user_id, 'campaign_reward', v_code.qc_amount, 'IN', v_qc_after, 'campaign_code', v_code.id::text, 'Campaign code QC reward', 'COMPLETED', jsonb_build_object('campaignId', v_campaign.id, 'code', v_code.code));
  END IF;

  IF v_code.cash_amount > 0 THEN
    INSERT INTO public.cash_wallet(user_id, available_balance, pending_balance, currency)
    VALUES (p_user_id, 0, 0, v_code.cash_currency)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT available_balance INTO v_cash_before FROM public.cash_wallet WHERE user_id = p_user_id FOR UPDATE;
    v_cash_after := v_cash_before + v_code.cash_amount;
    UPDATE public.cash_wallet SET available_balance = v_cash_after, currency = v_code.cash_currency, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.cash_wallet_ledger(user_id, amount, direction, currency, balance_after, reference_type, reference_id)
    VALUES (p_user_id, v_code.cash_amount, 'CREDIT', v_code.cash_currency, v_cash_after, 'CAMPAIGN_REWARD', v_code.id::text);
  END IF;

  IF v_code.boost_days > 0 THEN
    v_boost := public.grant_profile_boost(p_user_id, 'campaign', v_code.boost_days, NULL, v_code.boost_label, 'Campaign code reward', jsonb_build_object('campaignId', v_campaign.id, 'code', v_code.code));
  END IF;

  v_receipt_number := public.aqe_receipt_number();
  INSERT INTO public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,qc_amount,cash_amount,currency,boost_days,status,description,metadata)
  VALUES (v_receipt_number,p_user_id,'CAMPAIGN_REWARD','campaign_code',v_code.id::text,v_code.qc_amount,v_code.cash_amount,v_code.cash_currency,v_code.boost_days,'COMPLETED','Campaign code reward',jsonb_build_object('campaignId',v_campaign.id,'campaignName',v_campaign.name,'code',v_code.code,'boost',v_boost))
  RETURNING id INTO v_receipt_id;

  INSERT INTO public.campaign_redemptions(campaign_id,user_id,code_id,qc_amount,cash_amount,cash_currency,boost_days,receipt_id)
  VALUES(v_campaign.id,p_user_id,v_code.id,v_code.qc_amount,v_code.cash_amount,v_code.cash_currency,v_code.boost_days,v_receipt_id)
  RETURNING id INTO v_redemption_id;

  UPDATE public.campaign_codes SET uses_count = uses_count + 1 WHERE id = v_code.id;

  RETURN jsonb_build_object('ok',true,'redemptionId',v_redemption_id,'receiptId',v_receipt_id,'receiptNumber',v_receipt_number,'qc',v_code.qc_amount,'cash',v_code.cash_amount,'currency',v_code.cash_currency,'boostDays',v_code.boost_days);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This reward has already been redeemed.';
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_campaign_package(
  p_user_id uuid,
  p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg public.campaign_gift_packages%ROWTYPE;
  v_campaign public.campaigns%ROWTYPE;
  v_tier text;
  v_qc_before numeric := 0;
  v_qc_after numeric := 0;
  v_cash_before numeric := 0;
  v_cash_after numeric := 0;
  v_receipt_id uuid;
  v_receipt_number text;
  v_redemption_id uuid;
  v_boost jsonb;
BEGIN
  SELECT * INTO v_pkg FROM public.campaign_gift_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND OR NOT v_pkg.active THEN RAISE EXCEPTION 'Gift package is unavailable.'; END IF;
  SELECT * INTO v_campaign FROM public.campaigns WHERE id = v_pkg.campaign_id FOR UPDATE;
  IF v_campaign.status <> 'active' OR
     (v_campaign.starts_at IS NOT NULL AND now() < v_campaign.starts_at) OR
     (v_campaign.ends_at IS NOT NULL AND now() > v_campaign.ends_at) OR
     (v_pkg.expires_at IS NOT NULL AND now() > v_pkg.expires_at) THEN
    RAISE EXCEPTION 'This gift package is no longer available.';
  END IF;
  IF v_pkg.quantity IS NOT NULL AND v_pkg.claimed_count >= v_pkg.quantity THEN RAISE EXCEPTION 'This gift package is sold out.'; END IF;
  SELECT tier INTO v_tier FROM public.profiles WHERE user_id = p_user_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'Profile not found.'; END IF;
  IF cardinality(v_pkg.eligibility_tiers) > 0 AND NOT (v_tier = ANY(v_pkg.eligibility_tiers)) THEN RAISE EXCEPTION 'You are not eligible for this gift package.'; END IF;
  IF EXISTS (SELECT 1 FROM public.campaign_redemptions WHERE package_id = v_pkg.id AND user_id = p_user_id AND status = 'COMPLETED') THEN RAISE EXCEPTION 'You have already received this gift package.'; END IF;

  IF v_pkg.qc_amount > 0 THEN
    INSERT INTO public.qc_wallet(user_id,balance) VALUES(p_user_id,0) ON CONFLICT(user_id) DO NOTHING;
    SELECT balance INTO v_qc_before FROM public.qc_wallet WHERE user_id=p_user_id FOR UPDATE;
    v_qc_after := v_qc_before + v_pkg.qc_amount;
    UPDATE public.qc_wallet SET balance=v_qc_after,updated_at=now() WHERE user_id=p_user_id;
    INSERT INTO public.qc_ledger(user_id,transaction_type,amount,direction,balance_after,reference_type,reference_id,description,status,metadata)
    VALUES(p_user_id,'gift_package',v_pkg.qc_amount,'IN',v_qc_after,'gift_package',v_pkg.id::text,'Gift package QC reward','COMPLETED',jsonb_build_object('campaignId',v_campaign.id,'packageId',v_pkg.id));
  END IF;

  IF v_pkg.cash_amount > 0 THEN
    INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency) VALUES(p_user_id,0,0,v_pkg.cash_currency) ON CONFLICT(user_id) DO NOTHING;
    SELECT available_balance INTO v_cash_before FROM public.cash_wallet WHERE user_id=p_user_id FOR UPDATE;
    v_cash_after := v_cash_before + v_pkg.cash_amount;
    UPDATE public.cash_wallet SET available_balance=v_cash_after,currency=v_pkg.cash_currency,updated_at=now() WHERE user_id=p_user_id;
    INSERT INTO public.cash_wallet_ledger(user_id,amount,direction,currency,balance_after,reference_type,reference_id)
    VALUES(p_user_id,v_pkg.cash_amount,'CREDIT',v_pkg.cash_currency,v_cash_after,'GIFT_PACKAGE',v_pkg.id::text);
  END IF;

  IF v_pkg.boost_days > 0 THEN
    v_boost := public.grant_profile_boost(p_user_id,'campaign',v_pkg.boost_days,NULL,v_pkg.boost_label,'Gift package reward',jsonb_build_object('campaignId',v_campaign.id,'packageId',v_pkg.id));
  END IF;

  v_receipt_number := public.aqe_receipt_number();
  INSERT INTO public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,qc_amount,cash_amount,currency,boost_days,status,description,metadata)
  VALUES(v_receipt_number,p_user_id,'GIFT_PACKAGE','campaign_package',v_pkg.id::text,v_pkg.qc_amount,v_pkg.cash_amount,v_pkg.cash_currency,v_pkg.boost_days,'COMPLETED','Campaign gift package',jsonb_build_object('campaignId',v_campaign.id,'campaignName',v_campaign.name,'packageId',v_pkg.id,'packageName',v_pkg.name,'boost',v_boost))
  RETURNING id INTO v_receipt_id;

  INSERT INTO public.campaign_redemptions(campaign_id,user_id,package_id,qc_amount,cash_amount,cash_currency,boost_days,receipt_id)
  VALUES(v_campaign.id,p_user_id,v_pkg.id,v_pkg.qc_amount,v_pkg.cash_amount,v_pkg.cash_currency,v_pkg.boost_days,v_receipt_id)
  RETURNING id INTO v_redemption_id;

  UPDATE public.campaign_gift_packages SET claimed_count=claimed_count+1 WHERE id=v_pkg.id;

  RETURN jsonb_build_object('ok',true,'redemptionId',v_redemption_id,'receiptId',v_receipt_id,'receiptNumber',v_receipt_number,'qc',v_pkg.qc_amount,'cash',v_pkg.cash_amount,'currency',v_pkg.cash_currency,'boostDays',v_pkg.boost_days);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This gift package has already been received.';
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_campaign_code(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_campaign_package(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_campaign_code(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_campaign_package(uuid,uuid) TO service_role;

-- Create proof automatically for every QC/cash ledger movement that did not create a richer receipt.
CREATE OR REPLACE FUNCTION public.aqe_ledger_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_before numeric;
  v_status text := 'COMPLETED';
BEGIN
  IF TG_TABLE_NAME = 'qc_ledger' THEN
    v_before := CASE WHEN NEW.direction = 'IN' THEN NEW.balance_after - NEW.amount ELSE NEW.balance_after + NEW.amount END;
    INSERT INTO public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,amount,qc_amount,balance_before,balance_after,status,description,metadata)
    VALUES(public.aqe_receipt_number(),NEW.user_id,upper(NEW.transaction_type),'qc_ledger',NEW.reference_id,NEW.amount,CASE WHEN NEW.direction='IN' THEN NEW.amount ELSE -NEW.amount END,v_before,NEW.balance_after,CASE WHEN NEW.status='FAILED' THEN 'FAILED' ELSE v_status END,NEW.description,COALESCE(NEW.metadata,'{}'::jsonb));
  ELSE
    v_before := CASE WHEN NEW.direction = 'CREDIT' THEN NEW.balance_after - NEW.amount ELSE NEW.balance_after + NEW.amount END;
    IF NEW.reference_type IN ('WITHDRAWAL_RESERVATION') THEN v_status := 'PENDING'; END IF;
    INSERT INTO public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,amount,cash_amount,currency,balance_before,balance_after,status,description,metadata)
    VALUES(public.aqe_receipt_number(),NEW.user_id,upper(NEW.reference_type),'cash_ledger',NEW.reference_id,NEW.amount,CASE WHEN NEW.direction='CREDIT' THEN NEW.amount ELSE -NEW.amount END,NEW.currency,v_before,NEW.balance_after,v_status,NEW.reference_type,jsonb_build_object('direction',NEW.direction));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qc_ledger_receipt_trigger ON public.qc_ledger;
CREATE TRIGGER qc_ledger_receipt_trigger AFTER INSERT ON public.qc_ledger FOR EACH ROW EXECUTE FUNCTION public.aqe_ledger_receipt();

DROP TRIGGER IF EXISTS cash_ledger_receipt_trigger ON public.cash_wallet_ledger;
CREATE TRIGGER cash_ledger_receipt_trigger AFTER INSERT ON public.cash_wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.aqe_ledger_receipt();

-- Receipts for subscription records.
CREATE OR REPLACE FUNCTION public.aqe_subscription_receipt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,amount,currency,status,description,metadata)
  VALUES(public.aqe_receipt_number(),NEW.user_id,'SUBSCRIPTION','subscription',NEW.id::text,NEW.amount,NEW.currency,CASE WHEN NEW.status='active' THEN 'COMPLETED' ELSE 'PENDING' END,'Membership subscription',jsonb_build_object('tier',NEW.tier,'expiresAt',NEW.expires_at));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS subscription_receipt_trigger ON public.subscriptions;
CREATE TRIGGER subscription_receipt_trigger AFTER INSERT ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.aqe_subscription_receipt();
