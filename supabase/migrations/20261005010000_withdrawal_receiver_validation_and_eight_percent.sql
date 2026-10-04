-- AQE: withdrawal receiver validation and authoritative 8% service charge
create or replace function public.request_cash_withdrawal_atomic(
  p_user_id uuid,p_amount numeric,p_tier text,p_payment_method text,p_recipient_name text,
  p_recipient_account text,p_currency text,p_service_charge_rate numeric
) returns jsonb language plpgsql security definer set search_path=public as $function$
declare
  v_profile_tier text; v_wallet public.cash_wallet%rowtype; v_withdrawal public.vip_withdrawal_requests%rowtype;
  v_last timestamptz; v_fee numeric; v_net numeric; v_date date := (now() at time zone 'Africa/Kampala')::date;
  v_invites integer:=0; v_cooldown integer:=24;
begin
  select tier into v_profile_tier from public.profiles where user_id=p_user_id;
  if v_profile_tier not in ('basic','premium','vip') then raise exception 'A valid membership tier is required for withdrawals'; end if;
  if lower(coalesce(p_tier,''))<>v_profile_tier then raise exception 'Withdrawal tier does not match the member profile'; end if;
  if p_currency<>'UGX' then raise exception 'Withdrawals are processed in UGX'; end if;
  if p_amount<30000 then raise exception 'Minimum withdrawal amount is UGX 30,000'; end if;
  if p_amount>5000000 then raise exception 'Maximum withdrawal amount is UGX 5,000,000'; end if;
  if p_service_charge_rate<>0.08 then raise exception 'Withdrawal service charge must be 8%%'; end if;
  if nullif(trim(coalesce(p_recipient_name,'')),'') is null then raise exception 'Receiver name is required'; end if;
  if nullif(trim(coalesce(p_recipient_account,'')),'') is null then raise exception 'Phone number or card number is required'; end if;
  if p_payment_method not in ('AIRTEL_MONEY','MOBILE_MONEY','CARD') then raise exception 'Invalid withdrawal payment method'; end if;
  if v_profile_tier in ('basic','premium') then
    select count(*) into v_invites from public.profiles where referred_by=p_user_id;
    if v_invites<2 then raise exception 'Basic and Premium members need at least 2 direct invites before withdrawing'; end if;
  end if;
  if v_profile_tier='basic' and extract(dow from v_date) not in (0,6) then raise exception 'Basic withdrawals are available on weekends only'; end if;
  v_cooldown:=case when v_profile_tier='premium' then 48 else 24 end;
  select * into v_wallet from public.cash_wallet where user_id=p_user_id for update;
  if not found then raise exception 'Cash wallet not found'; end if;
  select created_at into v_last from public.vip_withdrawal_requests where user_id=p_user_id order by created_at desc limit 1;
  if v_last is not null and now()<v_last+make_interval(hours=>v_cooldown) then raise exception 'Withdrawal frequency limit reached. Please wait until the required interval has passed'; end if;
  if v_wallet.currency<>p_currency then raise exception 'Wallet currency does not match the withdrawal currency'; end if;
  if coalesce(v_wallet.available_balance,0)<p_amount then raise exception 'Insufficient wallet balance'; end if;
  v_fee:=round(p_amount*0.08,2); v_net:=round(p_amount-v_fee,2);
  insert into public.vip_withdrawal_requests(user_id,tier,payment_method,recipient_name,recipient_account,currency,amount,service_charge_rate,service_charge_amount,net_amount,status)
  values(p_user_id,v_profile_tier,p_payment_method,trim(p_recipient_name),trim(p_recipient_account),p_currency,p_amount,0.08,v_fee,v_net,'PENDING')
  returning * into v_withdrawal;
  update public.cash_wallet set available_balance=available_balance-p_amount,pending_balance=pending_balance+p_amount,updated_at=now() where user_id=p_user_id;
  insert into public.cash_wallet_ledger(user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
  values(p_user_id,v_withdrawal.id,p_amount,'DEBIT',p_currency,v_wallet.available_balance-p_amount,'WITHDRAWAL_RESERVATION',v_withdrawal.id::text);
  return jsonb_build_object('id',v_withdrawal.id,'userId',v_withdrawal.user_id,'tier',v_withdrawal.tier,'paymentMethod',v_withdrawal.payment_method,'recipientName',v_withdrawal.recipient_name,'recipientAccount',v_withdrawal.recipient_account,'currency',v_withdrawal.currency,'grossAmount',v_withdrawal.amount,'serviceChargeRate',v_withdrawal.service_charge_rate,'serviceChargeAmount',v_withdrawal.service_charge_amount,'netAmount',v_withdrawal.net_amount,'status',v_withdrawal.status,'createdAt',v_withdrawal.created_at,'directInviteCount',v_invites);
end;$function$;
notify pgrst,'reload schema';
