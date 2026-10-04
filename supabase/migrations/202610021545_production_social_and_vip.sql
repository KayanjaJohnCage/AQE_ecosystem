create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  recipient_id uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_no_self check (sender_id <> recipient_id)
);
create unique index if not exists friend_requests_pending_pair_idx on public.friend_requests(sender_id,recipient_id) where status='pending';
create index if not exists friend_requests_recipient_status_idx on public.friend_requests(recipient_id,status,created_at desc);
create index if not exists friend_requests_sender_status_idx on public.friend_requests(sender_id,status,created_at desc);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  kind text not null default 'general',
  priority text not null default 'normal',
  image_url text,
  published boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists announcements_live_idx on public.announcements(published,starts_at,ends_at,created_at desc);

create table if not exists public.announcement_dismissals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null,
  dismissed_at timestamptz not null default now(),
  unique(announcement_id,user_id)
);

create table if not exists public.vip_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  task_type text not null default 'general',
  reward_qc numeric not null default 0 check(reward_qc>=0),
  reward_cash numeric not null default 0 check(reward_cash>=0),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vip_tasks_active_idx on public.vip_tasks(active,starts_at,ends_at,sort_order,created_at desc);

create table if not exists public.vip_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.vip_tasks(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'completed' check(status in ('completed','approved','rejected')),
  completed_at timestamptz not null default now(),
  unique(task_id,user_id)
);

alter table public.friend_requests enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_dismissals enable row level security;
alter table public.vip_tasks enable row level security;
alter table public.vip_task_completions enable row level security;

drop policy if exists friend_requests_own_select on public.friend_requests;
create policy friend_requests_own_select on public.friend_requests for select to authenticated using(sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));
drop policy if exists friend_requests_own_insert on public.friend_requests;
create policy friend_requests_own_insert on public.friend_requests for insert to authenticated with check(sender_id=(select auth.uid()));
drop policy if exists friend_requests_own_update on public.friend_requests;
create policy friend_requests_own_update on public.friend_requests for update to authenticated using(sender_id=(select auth.uid()) or recipient_id=(select auth.uid())) with check(sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));

drop policy if exists announcements_public_select on public.announcements;
create policy announcements_public_select on public.announcements for select to anon,authenticated using(published=true and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()));
drop policy if exists announcement_dismissals_own on public.announcement_dismissals;
create policy announcement_dismissals_own on public.announcement_dismissals for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

drop policy if exists vip_tasks_public_select on public.vip_tasks;
create policy vip_tasks_public_select on public.vip_tasks for select to authenticated using(active=true and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()));
drop policy if exists vip_task_completions_own on public.vip_task_completions;
create policy vip_task_completions_own on public.vip_task_completions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

notify pgrst,'reload schema';
