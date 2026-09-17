-- AQE foundation schema for auth, roles, profiles, media, and product access

create extension if not exists pgcrypto;

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_name text not null references roles(name) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_name)
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text,
  bio text,
  phone text,
  country text,
  location text,
  category text,
  services text[],
  tier text not null default 'basic' check (tier in ('basic','premium','vip')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','approved','rejected','resubmission_required')),
  profile_photo_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feature_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  is_vip_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists feature_entitlements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  feature_key text not null references feature_definitions(key) on delete cascade,
  is_enabled boolean not null default false,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  unique (profile_id, feature_key)
);

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  enabled boolean not null default false,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists profile_media (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  profile_id uuid references profiles(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image','video')),
  mime_type text not null,
  file_size bigint not null default 0,
  duration integer,
  thumbnail_path text,
  visibility text not null default 'private' check (visibility in ('private','public','restricted')),
  is_profile_photo boolean not null default false,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','flagged')),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_user_id on profiles(user_id);
create index if not exists idx_feature_entitlements_profile on feature_entitlements(profile_id);
create index if not exists idx_profile_media_owner on profile_media(owner_user_id);
create index if not exists idx_profile_media_profile on profile_media(profile_id);

-- minimal seed roles
insert into roles (name)
values ('customer'), ('manager'), ('admin')
on conflict (name) do nothing;
