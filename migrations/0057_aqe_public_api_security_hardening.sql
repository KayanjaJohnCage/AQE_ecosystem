-- AQE 0057: public Data API security hardening
-- Canonical architecture: browser -> Next.js API -> server-side Supabase client.
-- This migration is idempotent and documents the hardening already applied to
-- the live AQE project.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated;

do $$
declare r record;
begin
  for r in
    select c.oid::regclass as rel
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('revoke all on table %s from public, anon, authenticated', r.rel);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p')
      and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid=c.oid)
  loop
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      left('deny_direct_data_api_'||r.relname,60), r.relname
    );
  end loop;
end $$;

revoke execute on function public.apply_membership_payment_verification() from public, anon, authenticated;
revoke execute on function public.aqe_subscription_receipt() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.is_aqe_manager() from anon;
revoke execute on function public.has_active_vip_content_subscription(uuid,uuid) from anon;

-- These helpers are used by RLS predicates, so authenticated execution is
-- intentionally retained.
grant execute on function public.is_aqe_manager() to authenticated;
grant execute on function public.has_active_vip_content_subscription(uuid,uuid) to authenticated;

alter function public.aqe_receipt_number() set search_path = pg_catalog, public;
alter function public.touch_payment_order_updated_at() set search_path = pg_catalog;
