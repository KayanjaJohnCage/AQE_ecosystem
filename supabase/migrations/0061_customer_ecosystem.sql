-- AQE customer ecosystem persistence for groups and rewards.
create table if not exists public.aqe_groups (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  description text, status text not null default 'active' check (status in ('active','archived','blocked')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.aqe_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.aqe_groups(id) on delete cascade,
  user_id uuid not null, role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(), unique(group_id,user_id)
);
create index if not exists aqe_group_members_user_idx on public.aqe_group_members(user_id);
create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  reward_key text not null, qc_cost numeric not null check (qc_cost > 0),
  status text not null default 'COMPLETED' check (status in ('PENDING','COMPLETED','REJECTED','REVERSED')),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists reward_redemptions_user_idx on public.reward_redemptions(user_id,created_at desc);
create unique index if not exists daily_qc_claims_user_date_unique on public.daily_qc_claims(user_id,claim_date);
do $$ begin alter publication supabase_realtime add table public.aqe_groups; exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.aqe_group_members; exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.reward_redemptions; exception when duplicate_object then null; when undefined_object then null; end $$;
drop policy if exists "aqe_manager_select_all" on public.aqe_groups;
create policy "aqe_manager_select_all" on public.aqe_groups for select to authenticated using (public.aqe_is_manager());
drop policy if exists "aqe_manager_select_all" on public.aqe_group_members;
create policy "aqe_manager_select_all" on public.aqe_group_members for select to authenticated using (public.aqe_is_manager());
drop policy if exists "aqe_manager_select_all" on public.reward_redemptions;
create policy "aqe_manager_select_all" on public.reward_redemptions for select to authenticated using (public.aqe_is_manager());
