-- VIP salary is UGX 10,000 per confirmed/approved direct VIP referral only.
CREATE OR REPLACE FUNCTION public.issue_vip_salary(
  p_user_id uuid,p_salary numeric,p_currency text DEFAULT 'UGX',p_period text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_period text:=coalesce(p_period,to_char(now() AT TIME ZONE 'Africa/Kampala','YYYY-MM'));
  v_existing public.vip_salary_payments%rowtype;
  v_invites integer:=0;
  v_amount numeric:=0;
BEGIN
  IF p_salary IS NULL OR p_salary<0 THEN RAISE EXCEPTION 'Invalid VIP salary amount'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE user_id=p_user_id AND tier='vip' AND verification_status='approved'
  ) THEN RAISE EXCEPTION 'Only verified VIP members can receive VIP salary'; END IF;
  SELECT * INTO v_existing FROM public.vip_salary_payments
  WHERE user_id=p_user_id AND period=v_period FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'alreadyPaid',true,'period',v_period,'amount',v_existing.amount);
  END IF;
  SELECT count(*) INTO v_invites FROM public.profiles
  WHERE referred_by=p_user_id AND tier='vip' AND verification_status='approved';
  v_amount:=round(v_invites*p_salary,2);
  INSERT INTO public.vip_asset_rooms(user_id,salary_balance)
  VALUES(p_user_id,0) ON CONFLICT(user_id) DO NOTHING;
  UPDATE public.vip_asset_rooms SET salary_balance=salary_balance+v_amount,updated_at=now()
  WHERE user_id=p_user_id;
  INSERT INTO public.vip_salary_payments(
    user_id,period,invite_count,salary_per_invite,amount,currency,status
  ) VALUES(
    p_user_id,v_period,v_invites,p_salary,v_amount,coalesce(nullif(p_currency,''),'UGX'),
    CASE WHEN v_amount>0 THEN 'credited' ELSE 'zero' END
  );
  RETURN jsonb_build_object(
    'ok',true,'alreadyPaid',false,'period',v_period,'inviteCount',v_invites,
    'salaryPerInvite',p_salary,'amount',v_amount,'currency',coalesce(nullif(p_currency,''),'UGX')
  );
END;
$function$;
