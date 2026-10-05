-- AQE: remove obsolete Basic/Premium referral-count withdrawal gate.
-- Withdrawal eligibility is tier schedule only:
-- Basic/Premium weekends; VIP up to 3 applications in rolling 7 days.
-- VIP salary is handled separately by vip_salary_withdrawals and is never ordinary earnings.
CREATE OR REPLACE FUNCTION public.request_cash_withdrawal_atomic(
  p_user_id uuid,p_amount numeric,p_tier text,p_payment_method text,p_recipient_name text,
  p_recipient_account text,p_currency text,p_service_charge_rate numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_tier text; v_wallet public.cash_wallet%rowtype; v_withdrawal public.vip_withdrawal_requests%rowtype;
  v_fee numeric; v_net numeric; v_date date := (now() at time zone 'Africa/Kampala')::date; v_recent_vip integer:=0;
BEGIN
  SELECT tier INTO v_profile_tier FROM public.profiles WHERE user_id=p_user_id;
  IF v_profile_tier NOT IN ('basic','premium','vip') THEN RAISE EXCEPTION 'A valid membership tier is required for withdrawals'; END IF;
  IF lower(coalesce(p_tier,''))<>v_profile_tier THEN RAISE EXCEPTION 'Withdrawal tier does not match the member profile'; END IF;
  IF p_currency<>'UGX' THEN RAISE EXCEPTION 'Withdrawals are processed in UGX'; END IF;
  IF p_amount<30000 THEN RAISE EXCEPTION 'Minimum withdrawal amount is UGX 30,000'; END IF;
  IF p_amount>5000000 THEN RAISE EXCEPTION 'Maximum withdrawal amount is UGX 5,000,000'; END IF;
  IF p_service_charge_rate<>0.08 THEN RAISE EXCEPTION 'Withdrawal service charge must be 8%%'; END IF;
  IF nullif(trim(coalesce(p_recipient_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Receiver name is required'; END IF;
  IF nullif(trim(coalesce(p_recipient_account,'')),'') IS NULL THEN RAISE EXCEPTION 'Phone number or card number is required'; END IF;
  IF p_payment_method NOT IN ('AIRTEL_MONEY','MOBILE_MONEY','CARD') THEN RAISE EXCEPTION 'Invalid withdrawal payment method'; END IF;
  IF v_profile_tier IN ('basic','premium') AND extract(dow from v_date) NOT IN (0,6) THEN RAISE EXCEPTION 'Basic and Premium withdrawals are available on weekends only'; END IF;
  IF v_profile_tier='vip' THEN
    SELECT count(*) INTO v_recent_vip FROM public.vip_withdrawal_requests WHERE user_id=p_user_id AND created_at >= now() - interval '7 days';
    IF v_recent_vip>=3 THEN RAISE EXCEPTION 'VIP withdrawals are limited to 3 applications in a rolling 7-day period'; END IF;
  END IF;
  SELECT * INTO v_wallet FROM public.cash_wallet WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash wallet not found'; END IF;
  IF v_wallet.currency<>p_currency THEN RAISE EXCEPTION 'Wallet currency does not match the withdrawal currency'; END IF;
  IF coalesce(v_wallet.available_balance,0)<p_amount THEN RAISE EXCEPTION 'Insufficient withdrawable wallet balance'; END IF;
  v_fee:=round(p_amount*0.08,2); v_net:=round(p_amount-v_fee,2);
  INSERT INTO public.vip_withdrawal_requests(user_id,tier,payment_method,recipient_name,recipient_account,currency,amount,service_charge_rate,service_charge_amount,net_amount,status)
  VALUES(p_user_id,v_profile_tier,p_payment_method,trim(p_recipient_name),trim(p_recipient_account),p_currency,p_amount,0.08,v_fee,v_net,'PENDING')
  RETURNING * INTO v_withdrawal;
  UPDATE public.cash_wallet SET available_balance=available_balance-p_amount,pending_balance=pending_balance+p_amount,updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO public.cash_wallet_ledger(user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
  VALUES(p_user_id,v_withdrawal.id,p_amount,'DEBIT',p_currency,v_wallet.available_balance-p_amount,'WITHDRAWAL_RESERVATION',v_withdrawal.id::text);
  RETURN jsonb_build_object('id',v_withdrawal.id,'userId',v_withdrawal.user_id,'tier',v_withdrawal.tier,'paymentMethod',v_withdrawal.payment_method,'recipientName',v_withdrawal.recipient_name,'recipientAccount',v_withdrawal.recipient_account,'currency',v_withdrawal.currency,'grossAmount',v_withdrawal.amount,'serviceChargeRate',v_withdrawal.service_charge_rate,'serviceChargeAmount',v_withdrawal.service_charge_amount,'netAmount',v_withdrawal.net_amount,'status',v_withdrawal.status,'createdAt',v_withdrawal.created_at,'weeklyWithdrawalCount',v_recent_vip);
END;
$function$;