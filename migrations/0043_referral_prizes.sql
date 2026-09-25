-- Configurable referral prizes. Ref-1 is available to all tiers; later reference levels
-- are VIP-only. The seeded requirements and descriptions mirror the CEO-provided prize sheet.

CREATE TABLE IF NOT EXISTS public.aqe_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL UNIQUE,
  title text NOT NULL,
  invite_requirement integer NOT NULL CHECK (invite_requirement > 0),
  tier_scope text NOT NULL DEFAULT 'vip' CHECK (tier_scope IN ('all','vip')),
  reward_type text NOT NULL DEFAULT 'physical' CHECK (reward_type IN ('physical','cash','none')),
  reward_description text,
  cash_value numeric CHECK (cash_value IS NULL OR cash_value >= 0),
  image_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aqe_prize_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id uuid NOT NULL REFERENCES public.aqe_prizes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'physical' CHECK (mode IN ('physical','cash')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','fulfilled','rejected')),
  cash_amount numeric CHECK (cash_amount IS NULL OR cash_amount >= 0),
  manager_note text,
  approved_by uuid,
  approved_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prize_id, user_id)
);

CREATE INDEX IF NOT EXISTS aqe_prizes_scope_idx
  ON public.aqe_prizes(active, tier_scope, invite_requirement, sort_order);
CREATE INDEX IF NOT EXISTS aqe_prize_claims_user_idx
  ON public.aqe_prize_claims(user_id, created_at DESC);

ALTER TABLE public.aqe_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aqe_prize_claims ENABLE ROW LEVEL SECURITY;

INSERT INTO public.aqe_prizes(
  ref_code,title,invite_requirement,tier_scope,reward_type,reward_description,sort_order
)
VALUES
  ('REF-1','Ref-1',6,'all','none','Not available',1),
  ('REF-2','Ref-2',15,'vip','physical','Bluetooth EarBuds.',2),
  ('REF-3','Ref-3',30,'vip','physical','OriamoPower Bank.',3),
  ('REF-4','Ref-4',60,'vip','physical','New Smart Phone.',4),
  ('REF-5','Ref-5',80,'vip','physical','New Hp Laptop.',5),
  ('REF-6','Ref-6',150,'vip','physical','iPhone 17 Pro-max.',6),
  ('REF-8','Ref-8',600,'vip','physical','Brand New Car.',8),
  ('REF-9','Ref-9',800,'vip','physical','Vacation Trip.',9),
  ('REF-10','Ref-10',1000,'vip','physical','Brand New House.',10)
ON CONFLICT(ref_code) DO UPDATE SET
  title=EXCLUDED.title,
  invite_requirement=EXCLUDED.invite_requirement,
  tier_scope=EXCLUDED.tier_scope,
  reward_type=EXCLUDED.reward_type,
  reward_description=EXCLUDED.reward_description,
  sort_order=EXCLUDED.sort_order,
  updated_at=now();

CREATE OR REPLACE FUNCTION public.request_prize_claim(
  p_user_id uuid,
  p_prize_id uuid,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prize public.aqe_prizes%ROWTYPE;
  v_tier text;
  v_invites integer := 0;
  v_claim public.aqe_prize_claims%ROWTYPE;
BEGIN
  SELECT * INTO v_prize FROM public.aqe_prizes WHERE id=p_prize_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prize not found or inactive.'; END IF;

  SELECT tier INTO v_tier FROM public.profiles WHERE user_id=p_user_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'Member profile not found.'; END IF;

  IF v_prize.tier_scope='vip' AND v_tier <> 'vip' THEN
    RAISE EXCEPTION 'This prize is available to VIP members only.';
  END IF;

  SELECT COUNT(*) INTO v_invites
  FROM public.profiles
  WHERE referred_by=p_user_id;

  IF v_invites < v_prize.invite_requirement THEN
    RAISE EXCEPTION 'You need % direct invites to unlock %.', v_prize.invite_requirement, v_prize.ref_code;
  END IF;

  IF lower(p_mode) NOT IN ('physical','cash') THEN
    RAISE EXCEPTION 'Invalid prize claim mode.';
  END IF;

  SELECT * INTO v_claim
  FROM public.aqe_prize_claims
  WHERE prize_id=p_prize_id AND user_id=p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok',true,'alreadyRequested',true,'claimId',v_claim.id,
      'status',v_claim.status,'mode',v_claim.mode,'cashAmount',v_claim.cash_amount
    );
  END IF;

  INSERT INTO public.aqe_prize_claims(prize_id,user_id,mode)
  VALUES(p_prize_id,p_user_id,lower(p_mode))
  RETURNING * INTO v_claim;

  RETURN jsonb_build_object(
    'ok',true,'alreadyRequested',false,'claimId',v_claim.id,
    'status',v_claim.status,'mode',v_claim.mode
  );
END;
$$;

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
  )
  ON CONFLICT(user_id,reference_id,direction) DO NOTHING;

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

REVOKE ALL ON FUNCTION public.request_prize_claim(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_prize_claim(uuid,uuid,text)
  TO service_role;

REVOKE ALL ON FUNCTION public.approve_prize_cash_claim(uuid,uuid,numeric,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_prize_cash_claim(uuid,uuid,numeric,text)
  TO service_role;
