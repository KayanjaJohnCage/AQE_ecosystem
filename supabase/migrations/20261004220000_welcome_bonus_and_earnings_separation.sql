-- AQE: first-membership welcome bonus, idempotent and server-authoritative
create or replace function public.aqe_grant_welcome_bonus()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_bonus numeric;
  v_wallet public.cash_wallet%rowtype;
  v_prior integer;
  v_ref uuid;
begin
  if new.transaction_type<>'MEMBERSHIP_UPGRADE' or new.status<>'COMPLETED' then return new; end if;
  select count(*) into v_prior from public.transaction_receipts
  where user_id=new.user_id and transaction_type='MEMBERSHIP_UPGRADE' and status='COMPLETED';
  if v_prior<>1 then return new; end if;
  if exists(select 1 from public.cash_wallet_ledger where user_id=new.user_id and reference_type='WELCOME_BONUS') then return new; end if;
  select coalesce((settings->'pricing'->>'welcomeBonus')::numeric,3000) into v_bonus from public.platform_settings where id=1;
  if coalesce(v_bonus,0)<=0 then return new; end if;

  insert into public.cash_wallet(user_id,available_balance,pending_balance,currency)
  values(new.user_id,0,0,new.currency) on conflict(user_id) do nothing;
  select * into v_wallet from public.cash_wallet where user_id=new.user_id for update;
  update public.cash_wallet set available_balance=coalesce(available_balance,0)+v_bonus,currency=new.currency,updated_at=now()
  where user_id=new.user_id;
  v_ref:=new.reference_id::uuid;

  insert into public.cash_wallet_ledger(user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
  values(new.user_id,v_ref,v_bonus,'CREDIT',new.currency,coalesce(v_wallet.available_balance,0)+v_bonus,'WELCOME_BONUS',new.receipt_number)
  on conflict(user_id,payment_order_id,direction) do nothing;

  insert into public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,amount,currency,status,description,metadata)
  values(public.aqe_receipt_number(),new.user_id,'WELCOME_BONUS','membership_upgrade',new.reference_id,v_bonus,new.currency,'COMPLETED',
    'AQE first membership welcome bonus',jsonb_build_object('membershipReceipt',new.receipt_number,'bonusAmount',v_bonus));

  perform public.aqe_notify(new.user_id,'welcome_bonus','Welcome bonus credited',
    'Your AQE welcome bonus of '||v_bonus||' UGX has been credited to your account.',
    'transaction_receipt',new.reference_id,'WELCOME-BONUS-'||new.user_id::text,
    jsonb_build_object('amount',v_bonus,'currency',new.currency));
  return new;
end;
$$;

drop trigger if exists trg_aqe_welcome_bonus on public.transaction_receipts;
create trigger trg_aqe_welcome_bonus
after insert on public.transaction_receipts
for each row execute function public.aqe_grant_welcome_bonus();

-- Backfill only first confirmed memberships that have never received a welcome bonus.
do $$
declare
  r record;
  v_bonus numeric;
  v_wallet public.cash_wallet%rowtype;
begin
  select coalesce((settings->'pricing'->>'welcomeBonus')::numeric,3000)
  into v_bonus from public.platform_settings where id=1;

  for r in
    select tr.user_id,tr.reference_id::uuid payment_order_id,tr.currency,tr.receipt_number
    from public.transaction_receipts tr
    where tr.transaction_type='MEMBERSHIP_UPGRADE'
      and tr.status='COMPLETED'
      and not exists(select 1 from public.cash_wallet_ledger l
        where l.user_id=tr.user_id and l.reference_type='WELCOME_BONUS')
      and tr.created_at=(
        select min(x.created_at) from public.transaction_receipts x
        where x.user_id=tr.user_id and x.transaction_type='MEMBERSHIP_UPGRADE' and x.status='COMPLETED'
      )
  loop
    insert into public.cash_wallet(user_id,available_balance,pending_balance,currency)
    values(r.user_id,0,0,r.currency) on conflict(user_id) do nothing;
    select * into v_wallet from public.cash_wallet where user_id=r.user_id for update;
    update public.cash_wallet set available_balance=coalesce(available_balance,0)+v_bonus,currency=r.currency,updated_at=now()
    where user_id=r.user_id;
    insert into public.cash_wallet_ledger(user_id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id)
    values(r.user_id,r.payment_order_id,v_bonus,'CREDIT',r.currency,coalesce(v_wallet.available_balance,0)+v_bonus,'WELCOME_BONUS',r.receipt_number)
    on conflict(user_id,payment_order_id,direction) do nothing;
    insert into public.transaction_receipts(receipt_number,user_id,transaction_type,source,reference_id,amount,currency,status,description,metadata)
    values(public.aqe_receipt_number(),r.user_id,'WELCOME_BONUS','membership_upgrade',r.payment_order_id::text,v_bonus,r.currency,'COMPLETED',
      'AQE first membership welcome bonus',jsonb_build_object('membershipReceipt',r.receipt_number,'bonusAmount',v_bonus));
  end loop;
end $$;
