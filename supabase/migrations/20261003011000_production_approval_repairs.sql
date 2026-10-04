-- AQE production approval repairs
create or replace function public.aqe_manager_dashboard_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'vip', (select count(*) from public.profiles where tier='vip'),
    'media', (select count(*) from public.profile_media),
    'transactions', (select count(*) from public.transaction_receipts),
    'bookings', (select count(*) from public.bookings),
    'messages', (select count(*) from public.direct_messages),
    'products', (select count(*) from public.marketplace_products),
    'support', (select count(*) from public.support_ticket where status='OPEN'),
    'withdrawals', (select count(*) from public.vip_withdrawal_requests where status='PENDING')
  );
$$;
revoke all on function public.aqe_manager_dashboard_counts() from public;
grant execute on function public.aqe_manager_dashboard_counts() to service_role;

create table if not exists public.vip_salary_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount numeric(14,2) not null check (amount >= 30000),
  currency text not null default 'UGX',
  recipient_name text not null,
  recipient_account text not null,
  payment_method text not null default 'MOBILE_MONEY',
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vip_salary_withdrawals_user on public.vip_salary_withdrawals(user_id, created_at desc);
alter table public.vip_salary_withdrawals enable row level security;
revoke all on public.vip_salary_withdrawals from anon;
grant select,insert,update on public.vip_salary_withdrawals to service_role;
