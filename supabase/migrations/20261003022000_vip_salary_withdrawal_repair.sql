-- VIP salary is a separate salary balance. Its withdrawal must not be blocked by the general UGX 30,000 wallet-withdrawal minimum.
alter table public.vip_salary_withdrawals
  drop constraint if exists vip_salary_withdrawals_amount_check;

alter table public.vip_salary_withdrawals
  add constraint vip_salary_withdrawals_amount_check check (amount > 0);

notify pgrst, 'reload schema';
