-- Manager troubleshooting requests with a fixed 5 QC service charge.
CREATE TABLE IF NOT EXISTS public.account_troubleshoot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_change text NOT NULL CHECK (requested_change IN ('account_name','email','password','other')),
  details text NOT NULL CHECK (char_length(details) BETWEEN 5 AND 4000),
  qc_charge numeric NOT NULL DEFAULT 5 CHECK (qc_charge = 5),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS account_troubleshoot_user_idx ON public.account_troubleshoot_requests(user_id, created_at DESC);
ALTER TABLE public.account_troubleshoot_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_troubleshoot_select_own_or_manager ON public.account_troubleshoot_requests;
CREATE POLICY account_troubleshoot_select_own_or_manager ON public.account_troubleshoot_requests
  FOR SELECT USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS account_troubleshoot_insert_own ON public.account_troubleshoot_requests;
CREATE POLICY account_troubleshoot_insert_own ON public.account_troubleshoot_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS account_troubleshoot_update_manager ON public.account_troubleshoot_requests;
CREATE POLICY account_troubleshoot_update_manager ON public.account_troubleshoot_requests
  FOR UPDATE USING (public.is_aqe_manager()) WITH CHECK (public.is_aqe_manager());

CREATE OR REPLACE FUNCTION public.create_account_troubleshoot_request_atomic(
  p_user_id uuid,
  p_requested_change text,
  p_details text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_after numeric;
  v_id uuid;
BEGIN
  IF p_requested_change NOT IN ('account_name','email','password','other') THEN
    RETURN jsonb_build_object('ok',false,'reason','Invalid troubleshoot request type.');
  END IF;
  IF char_length(trim(p_details)) < 5 OR char_length(trim(p_details)) > 4000 THEN
    RETURN jsonb_build_object('ok',false,'reason','Troubleshoot details must be between 5 and 4000 characters.');
  END IF;

  INSERT INTO public.qc_wallet(user_id,balance)
  VALUES(p_user_id,0)
  ON CONFLICT(user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM public.qc_wallet WHERE user_id=p_user_id FOR UPDATE;
  IF COALESCE(v_balance,0) < 5 THEN
    RETURN jsonb_build_object('ok',false,'reason','Insufficient QC balance. 5 QC is required for manager troubleshooting.');
  END IF;

  v_after := v_balance - 5;
  UPDATE public.qc_wallet SET balance=v_after, updated_at=now() WHERE user_id=p_user_id;

  INSERT INTO public.qc_ledger(user_id,transaction_type,amount,direction,balance_after,reference_type,description,status,metadata)
  VALUES(p_user_id,'manager_troubleshoot',5,'OUT',v_after,'ACCOUNT_TROUBLESHOOT','Manager troubleshooting request','COMPLETED',jsonb_build_object('requestedChange',p_requested_change))
  RETURNING id INTO v_id;

  INSERT INTO public.account_troubleshoot_requests(user_id,requested_change,details,qc_charge,status)
  VALUES(p_user_id,p_requested_change,trim(p_details),5,'OPEN')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok',true,'requestId',v_id,'chargedQc',5,'balanceAfter',v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.create_account_troubleshoot_request_atomic(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_account_troubleshoot_request_atomic(uuid,text,text) TO service_role;
