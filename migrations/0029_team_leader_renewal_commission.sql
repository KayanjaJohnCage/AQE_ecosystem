-- Pay configured team-leader renewal commission after a subscription renewal.
-- VIP commission is intentionally not invented when the CEO pricing sheet does not define one.

CREATE OR REPLACE FUNCTION public.aqe_team_leader_renewal_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader uuid;
  v_leader_tier text;
  v_settings jsonb;
  v_commission numeric := 0;
  v_wallet public.cash_wallet%ROWTYPE;
  v_after numeric;
  v_reference text;
BEGIN
  SELECT referred_by INTO v_leader FROM public.profiles WHERE user_id=NEW.user_id;
  IF v_leader IS NULL THEN RETURN NEW; END IF;

  SELECT tier INTO v_leader_tier FROM public.profiles WHERE user_id=v_leader;
  SELECT settings INTO v_settings FROM public.platform_settings WHERE id=1;

  v_commission := CASE
    WHEN v_leader_tier='basic' THEN COALESCE((v_settings->'pricing'->'teamLeaderRenewalCommission'->>'basic')::numeric,2500)
    WHEN v_leader_tier='premium' THEN COALESCE((v_settings->'pricing'->'teamLeaderRenewalCommission'->>'premium')::numeric,5000)
    ELSE 0
  END;

  IF v_commission <= 0 THEN RETURN NEW; END IF;

  v_reference := 'TEAM-LEADER-RENEWAL-' || NEW.id::text;
  IF EXISTS (SELECT 1 FROM public.cash_wallet_ledger WHERE user_id=v_leader AND reference_type='TEAM_LEADER_RENEWAL' AND reference_id=v_reference) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
  VALUES(v_leader,0,0,NEW.currency)
  ON CONFLICT(user_id) DO NOTHING;

  SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=v_leader FOR UPDATE;
  v_after := v_wallet.available_balance + v_commission;
  UPDATE public.cash_wallet SET available_balance=v_after,currency=NEW.currency,updated_at=now() WHERE user_id=v_leader;

  INSERT INTO public.cash_wallet_ledger(user_id,amount,direction,currency,balance_after,reference_type,reference_id)
  VALUES(v_leader,v_commission,'CREDIT',NEW.currency,v_after,'TEAM_LEADER_RENEWAL',v_reference);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_leader_renewal_commission_trigger ON public.subscriptions;
CREATE TRIGGER team_leader_renewal_commission_trigger
AFTER INSERT ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.aqe_team_leader_renewal_commission();
