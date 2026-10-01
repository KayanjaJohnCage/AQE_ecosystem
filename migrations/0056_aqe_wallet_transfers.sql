-- 0056 atomic internal wallet transfers
CREATE OR REPLACE FUNCTION public.transfer_cash_wallet_atomic(
  p_sender_user_id uuid,
  p_recipient_phone text,
  p_amount numeric,
  p_note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender public.cash_wallet%ROWTYPE;
  v_recipient public.cash_wallet%ROWTYPE;
  v_recipient_user_id uuid;
  v_reference text;
  v_sender_balance numeric;
  v_recipient_balance numeric;
  v_currency text;
  v_sender_name text;
BEGIN
  IF p_sender_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A valid sender and transfer amount are required';
  END IF;

  SELECT user_id INTO v_recipient_user_id
  FROM public.profiles
  WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')
        = regexp_replace(coalesce(p_recipient_phone,''),'[^0-9]','','g')
    AND btrim(coalesce(phone,'')) <> ''
  LIMIT 1;

  IF v_recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'Recipient phone number is not registered on AQE';
  END IF;

  IF v_recipient_user_id = p_sender_user_id THEN
    RAISE EXCEPTION 'You cannot transfer wallet cash to yourself';
  END IF;

  IF p_sender_user_id::text < v_recipient_user_id::text THEN
    SELECT * INTO v_sender FROM public.cash_wallet WHERE user_id=p_sender_user_id FOR UPDATE;
    SELECT * INTO v_recipient FROM public.cash_wallet WHERE user_id=v_recipient_user_id FOR UPDATE;
  ELSE
    SELECT * INTO v_recipient FROM public.cash_wallet WHERE user_id=v_recipient_user_id FOR UPDATE;
    SELECT * INTO v_sender FROM public.cash_wallet WHERE user_id=p_sender_user_id FOR UPDATE;
  END IF;

  IF v_sender.user_id IS NULL THEN RAISE EXCEPTION 'Sender wallet not found'; END IF;
  IF v_recipient.user_id IS NULL THEN RAISE EXCEPTION 'Recipient wallet not found'; END IF;

  v_currency := upper(coalesce(v_sender.currency,'UGX'));
  IF upper(coalesce(v_recipient.currency,v_currency)) <> v_currency THEN
    RAISE EXCEPTION 'Sender and recipient wallets use different currencies';
  END IF;

  IF coalesce(v_sender.available_balance,0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Available % %',
      v_currency, to_char(v_sender.available_balance,'FM999,999,990.00');
  END IF;

  v_sender_balance := v_sender.available_balance - p_amount;
  v_recipient_balance := coalesce(v_recipient.available_balance,0) + p_amount;
  v_reference := 'AQE-TRANSFER-' ||
    to_char(clock_timestamp() AT TIME ZONE 'Africa/Kampala','YYYYMMDDHH24MISSMS') ||
    '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  UPDATE public.cash_wallet SET available_balance=v_sender_balance,updated_at=now()
  WHERE user_id=p_sender_user_id;
  UPDATE public.cash_wallet SET available_balance=v_recipient_balance,currency=v_currency,updated_at=now()
  WHERE user_id=v_recipient_user_id;

  INSERT INTO public.cash_wallet_ledger(
    user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id
  ) VALUES
    (p_sender_user_id,NULL,p_amount,'DEBIT',v_currency,v_sender_balance,'WALLET_TRANSFER',v_reference),
    (v_recipient_user_id,NULL,p_amount,'CREDIT',v_currency,v_recipient_balance,'WALLET_TRANSFER',v_reference);

  SELECT display_name INTO v_sender_name FROM public.profiles WHERE user_id=p_sender_user_id;

  INSERT INTO public.transaction_receipts(
    receipt_number,user_id,transaction_type,source,reference_id,amount,currency,status,description,metadata
  ) VALUES
    (public.aqe_receipt_number(),p_sender_user_id,'WALLET_TRANSFER','wallet_transfer',
     v_reference,p_amount,v_currency,'COMPLETED','Wallet transfer sent',
     jsonb_build_object('recipientUserId',v_recipient_user_id,'note',coalesce(p_note,''))),
    (public.aqe_receipt_number(),v_recipient_user_id,'WALLET_TRANSFER','wallet_transfer',
     v_reference,p_amount,v_currency,'COMPLETED','Wallet transfer received',
     jsonb_build_object('senderUserId',p_sender_user_id,'senderName',v_sender_name,'note',coalesce(p_note,'')));

  PERFORM public.aqe_notify(
    v_recipient_user_id,'wallet_transfer_received','Wallet cash received',
    coalesce(v_sender_name,'An AQE member')||' sent you '||
      v_currency||' '||to_char(p_amount,'FM999,999,990.00')||'.',
    'wallet_transfer',v_reference,'WALLET-TRANSFER-RECEIVED-'||v_reference,
    jsonb_build_object('reference',v_reference,'amount',p_amount,'currency',v_currency)
  );
  PERFORM public.aqe_notify(
    p_sender_user_id,'wallet_transfer_sent','Wallet transfer completed',
    'You sent '||v_currency||' '||to_char(p_amount,'FM999,999,990.00')||
      ' to the registered recipient.',
    'wallet_transfer',v_reference,'WALLET-TRANSFER-SENT-'||v_reference,
    jsonb_build_object('reference',v_reference,'amount',p_amount,'currency',v_currency)
  );

  RETURN jsonb_build_object(
    'ok',true,'reference',v_reference,'recipientUserId',v_recipient_user_id,
    'amount',p_amount,'currency',v_currency,'senderBalance',v_sender_balance,
    'recipientBalance',v_recipient_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_cash_wallet_atomic(uuid,text,numeric,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_cash_wallet_atomic(uuid,text,numeric,text)
TO service_role;
