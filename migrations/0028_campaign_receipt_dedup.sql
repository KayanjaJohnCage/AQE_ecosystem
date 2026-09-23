-- Avoid duplicate child receipts for campaign rewards; campaign redemption creates one combined proof.

CREATE OR REPLACE FUNCTION public.aqe_ledger_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_before numeric;
  v_status text := 'COMPLETED';
BEGIN
  IF TG_TABLE_NAME = 'qc_ledger' THEN
    IF NEW.reference_type IN ('campaign_code','gift_package') THEN RETURN NEW; END IF;
    v_before := CASE WHEN NEW.direction = 'IN' THEN NEW.balance_after - NEW.amount ELSE NEW.balance_after + NEW.amount END;
    INSERT INTO public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,amount,qc_amount,balance_before,balance_after,status,description,metadata)
    VALUES(public.aqe_receipt_number(),NEW.user_id,upper(NEW.transaction_type),'qc_ledger',NEW.reference_id,NEW.amount,CASE WHEN NEW.direction='IN' THEN NEW.amount ELSE -NEW.amount END,v_before,NEW.balance_after,CASE WHEN NEW.status='FAILED' THEN 'FAILED' ELSE v_status END,NEW.description,COALESCE(NEW.metadata,'{}'::jsonb));
  ELSE
    IF NEW.reference_type IN ('CAMPAIGN_REWARD','GIFT_PACKAGE') THEN RETURN NEW; END IF;
    v_before := CASE WHEN NEW.direction = 'CREDIT' THEN NEW.balance_after - NEW.amount ELSE NEW.balance_after + NEW.amount END;
    IF NEW.reference_type IN ('WITHDRAWAL_RESERVATION') THEN v_status := 'PENDING'; END IF;
    INSERT INTO public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,amount,cash_amount,currency,balance_before,balance_after,status,description,metadata)
    VALUES(public.aqe_receipt_number(),NEW.user_id,upper(NEW.reference_type),'cash_ledger',NEW.reference_id,NEW.amount,CASE WHEN NEW.direction='CREDIT' THEN NEW.amount ELSE -NEW.amount END,NEW.currency,v_before,NEW.balance_after,v_status,NEW.reference_type,jsonb_build_object('direction',NEW.direction));
  END IF;
  RETURN NEW;
END;
$$;
