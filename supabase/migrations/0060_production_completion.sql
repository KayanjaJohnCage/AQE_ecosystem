-- AQE production completion: manager controls, marketplace media, realtime and account blocking.
alter table public.profiles
  add column if not exists account_status text not null default 'active';

do $$
begin
  alter table public.profiles
    add constraint profiles_account_status_check
    check (account_status in ('active','blocked','suspended'));
exception
  when duplicate_object then null;
end $$;

create index if not exists profiles_account_status_idx on public.profiles(account_status);

alter table public.marketplace_products
  add column if not exists image_path text,
  add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('marketplace-media', 'marketplace-media', true)
on conflict (id) do update set public = true;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','payment_orders','cash_wallet','transaction_receipts','notifications',
    'profile_media','bookings','direct_messages','marketplace_products','support_ticket',
    'vip_withdrawal_requests','campaigns','campaign_codes','campaign_gift_packages',
    'campaign_redemptions','vip_content_settings','vip_content_subscriptions',
    'vip_salary_payments','aqe_prizes','aqe_prize_claims','qc_ledger','creator_earnings',
    'profile_comments','account_troubleshoot_requests','referral_earnings','subscriptions'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

create or replace function public.aqe_is_manager()
returns boolean language sql stable security definer set search_path=public
as $$ select exists (
  select 1 from public.user_roles
  where user_id=auth.uid() and role_name in ('manager','admin')
); $$;

grant execute on function public.aqe_is_manager() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','payment_orders','cash_wallet','transaction_receipts','notifications',
    'profile_media','bookings','direct_messages','marketplace_products','support_ticket',
    'vip_withdrawal_requests','campaigns','campaign_codes','campaign_gift_packages',
    'campaign_redemptions','vip_content_settings','vip_content_subscriptions',
    'vip_salary_payments','aqe_prizes','aqe_prize_claims','qc_ledger','creator_earnings',
    'profile_comments','account_troubleshoot_requests','referral_earnings','subscriptions'
  ] loop
    execute format('drop policy if exists "aqe_manager_select_all" on public.%I', t);
    execute format('create policy "aqe_manager_select_all" on public.%I for select to authenticated using (public.aqe_is_manager())', t);
  end loop;
end $$;
