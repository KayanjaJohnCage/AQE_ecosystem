-- AQE production auth/role repair.
-- Safe/idempotent: preserves existing auth.users and public data.
-- Establishes the role model required by the application and synchronizes
-- legacy profiles.role values when that older column exists.

create extension if not exists pgcrypto;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_name text not null references public.roles(name) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_name)
);

insert into public.roles (name)
values ('customer'), ('manager'), ('admin')
on conflict (name) do nothing;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text,
  bio text,
  phone text,
  country text,
  location text,
  category text,
  services text[],
  tier text not null default 'basic',
  verification_status text not null default 'unverified',
  profile_photo_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists bio text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists nationality text,
  add column if not exists location text,
  add column if not exists category text,
  add column if not exists services text[],
  add column if not exists tier text default 'basic',
  add column if not exists verification_status text default 'unverified',
  add column if not exists profile_photo_id uuid,
  add column if not exists age integer,
  add column if not exists gender text,
  add column if not exists pronouns text,
  add column if not exists headline text,
  add column if not exists languages text[] default '{}',
  add column if not exists area text,
  add column if not exists availability text,
  add column if not exists visibility text default 'public',
  add column if not exists content_categories text[] default '{}',
  add column if not exists social_platforms jsonb default '{}'::jsonb,
  add column if not exists contact_methods jsonb default '{}'::jsonb,
  add column if not exists timezone text default 'Africa/Kampala',
  add column if not exists referral_code text,
  add column if not exists referred_by uuid,
  add column if not exists identity_last_changed_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists profiles_user_id_unique_idx
  on public.profiles(user_id);

create unique index if not exists profiles_referral_code_unique_idx
  on public.profiles(referral_code)
  where referral_code is not null;

-- If the older schema has profiles.role, preserve it and synchronize it
-- into the authoritative user_roles table.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    insert into public.user_roles (user_id, role_name)
    select p.user_id,
           case
             when p.role in ('manager','admin') then p.role
             else 'customer'
           end
    from public.profiles p
    where p.user_id is not null
    on conflict (user_id, role_name) do nothing;
  end if;
end $$;

-- Existing Supabase accounts without an application role are customers by default.
insert into public.user_roles (user_id, role_name)
select u.id, 'customer'
from auth.users u
where not exists (
  select 1 from public.user_roles ur where ur.user_id = u.id
)
on conflict (user_id, role_name) do nothing;

create or replace function public.is_aqe_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role_name in ('manager', 'admin')
  );
$$;

alter table public.user_roles enable row level security;

drop policy if exists user_roles_select_own_or_manager on public.user_roles;
create policy user_roles_select_own_or_manager
  on public.user_roles
  for select
  using (
    user_id = auth.uid()
    or public.is_aqe_manager()
  );

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_manager on public.profiles;
create policy profiles_select_own_or_manager
  on public.profiles
  for select
  using (
    user_id = auth.uid()
    or public.is_aqe_manager()
  );

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  with check (user_id = auth.uid());

drop policy if exists profiles_update_own_or_manager on public.profiles;
create policy profiles_update_own_or_manager
  on public.profiles
  for update
  using (
    user_id = auth.uid()
    or public.is_aqe_manager()
  )
  with check (
    user_id = auth.uid()
    or public.is_aqe_manager()
  );

-- Ensure the existing AQE manager account has a profile without overwriting
-- any existing profile information.
insert into public.profiles (
  user_id,
  display_name,
  category,
  tier,
  verification_status,
  visibility,
  timezone
)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'display_name',''), 'AQE Manager'),
  'admin',
  'basic',
  'approved',
  'private',
  'Africa/Kampala'
from auth.users u
where lower(u.email) = lower('admin@afriqueerescortsecosystem.com')
  and not exists (
    select 1 from public.profiles p where p.user_id = u.id
  );

-- Give the existing AQE manager account the manager role.
insert into public.user_roles (user_id, role_name)
select u.id, 'manager'
from auth.users u
where lower(u.email) = lower('admin@afriqueerescortsecosystem.com')
on conflict (user_id, role_name) do nothing;

-- Helpful indexes for login-by-phone and role authorization.
create index if not exists profiles_phone_idx on public.profiles(phone);
create index if not exists user_roles_user_id_idx on public.user_roles(user_id);
