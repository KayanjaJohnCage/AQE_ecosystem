-- 0056: AQE payment lifecycle notifications and VIP content defaults
-- Applied to the live Supabase project as aqe_payment_notifications_0056.
--
-- This migration creates a server-only notification helper and payment-order
-- lifecycle trigger. Customer notifications are generated for completed,
-- rejected and cancelled payment requests. Manager/admin users receive an
-- in-app notification for every new payment order. Verified VIP membership
-- confirmation also creates default VIP content settings if none exist.
--
-- The live SQL is intentionally kept in the migration history; re-application
-- should be performed through the normal migration process, not by manually
-- duplicating database objects.

create or replace function public.aqe_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_user_id is null then return null; end if;
  insert into public.notifications(
    user_id,type,title,body,reference_type,reference_id,dedupe_key,metadata
  )
  values(
    p_user_id,
    coalesce(nullif(trim(p_type),''),'system'),
    coalesce(nullif(trim(p_title),''),'AQE notification'),
    coalesce(nullif(trim(p_body),''),'You have a new AQE notification.'),
    p_reference_type,p_reference_id,p_dedupe_key,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (dedupe_key) do update set metadata=excluded.metadata
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.aqe_notify(uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqe_notify(uuid,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.aqe_payment_order_lifecycle_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_tier text;
  v_title text;
  v_body text;
  v_type text;
begin
  if tg_op='INSERT' then
    for v_tier in
      select distinct ur.user_id::text
      from public.user_roles ur
      where lower(ur.role_name) in ('manager','admin')
    loop
      perform public.aqe_notify(
        v_tier::uuid,'payment_request','New payment request',
        format('%s %s request %s is awaiting confirmation.',
          upper(coalesce(new.metadata->>'requestedTier','wallet')),
          upper(replace(coalesce(new.metadata->>'paymentKind','wallet_deposit'),'_',' ')),
          new.reference),
        'payment_order',new.id::text,
        'PAYMENT-NEW-'||new.id::text||'-'||v_tier,
        jsonb_build_object('paymentOrderId',new.id,'amount',new.amount,
          'currency',new.currency,'paymentKind',new.metadata->>'paymentKind',
          'requestedTier',new.metadata->>'requestedTier')
      );
    end loop;
    return new;
  end if;

  if tg_op='UPDATE' and old.status is distinct from new.status
     and new.status in ('confirmed','rejected','cancelled') then
    v_kind:=lower(coalesce(new.metadata->>'paymentKind','wallet_deposit'));
    v_tier:=upper(coalesce(new.metadata->>'requestedTier','basic'));

    if new.status='confirmed' then
      v_type:='payment_completed';
      if v_kind='membership_upgrade' then
        v_title:='Membership payment completed';
        v_body:=format('Your %s membership payment of %s %s was confirmed. Your membership is now active.',
          v_tier,new.currency,to_char(new.amount,'FM999,999,990.00'));
      elsif v_kind='wallet_deposit' then
        v_title:='Wallet deposit completed';
        v_body:=format('Your wallet deposit of %s %s was confirmed and credited to your AQE cash wallet.',
          new.currency,to_char(new.amount,'FM999,999,990.00'));
      elsif v_kind='qc_recharge' then
        v_title:='QC recharge completed';
        v_body:='Your QueerCoins recharge was confirmed.';
      elsif v_kind='vip_content_subscription' then
        v_title:='VIP content subscription active';
        v_body:='Your VIP creator-content subscription is now active.';
      else
        v_title:='Payment completed';
        v_body:=format('Your AQE payment %s was confirmed.',new.reference);
      end if;
    elsif new.status='rejected' then
      v_type:='payment_rejected';
      v_title:='Payment request rejected';
      v_body:=format('Your AQE payment request %s was rejected by the manager.',new.reference);
    else
      v_type:='payment_cancelled';
      v_title:='Payment request cancelled';
      v_body:=format('Your AQE payment request %s was cancelled.',new.reference);
    end if;

    perform public.aqe_notify(new.user_id,v_type,v_title,v_body,
      'payment_order',new.id::text,
      'PAYMENT-'||upper(new.status)||'-'||new.id::text,
      jsonb_build_object('paymentOrderId',new.id,'amount',new.amount,
        'currency',new.currency,'paymentKind',v_kind,'tier',lower(v_tier)));

    if new.status='confirmed' and v_kind='membership_upgrade' and lower(v_tier)='vip' then
      insert into public.vip_content_settings(
        vip_user_id,enabled,monthly_price,currency,title,description
      )
      values(new.user_id,false,8500,'UGX','VIP Content',
        'Subscriber-only content from this verified VIP creator.')
      on conflict (vip_user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.aqe_payment_order_lifecycle_notify() from public,anon,authenticated;
grant execute on function public.aqe_payment_order_lifecycle_notify() to service_role;

drop trigger if exists trg_aqe_payment_order_lifecycle_notify on public.payment_orders;
create trigger trg_aqe_payment_order_lifecycle_notify
after insert or update of status on public.payment_orders
for each row execute function public.aqe_payment_order_lifecycle_notify();

alter function public.aqe_receipt_number() set search_path=pg_catalog,public;
notify pgrst,'reload schema';
