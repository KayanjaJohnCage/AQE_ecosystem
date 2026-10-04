-- AQE manager controls v2: multiple payment receivers, manager media assets and customer filter configuration.
create table if not exists public.payment_receivers (
  id uuid primary key default gen_random_uuid(),
  receiver_name text not null,
  receiver_phone text not null,
  receiver_card text not null,
  network text not null default 'Mukuru',
  instructions text not null default '',
  status text not null default 'available',
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_receivers_status_check check (status in ('available','busy','inactive'))
);

create index if not exists payment_receivers_status_idx on public.payment_receivers(status);

alter table public.payment_receivers enable row level security;

drop policy if exists "aqe_manager_select_payment_receivers" on public.payment_receivers;
create policy "aqe_manager_select_payment_receivers"
on public.payment_receivers for select to authenticated
using (public.aqe_is_manager());

drop policy if exists "aqe_manager_write_payment_receivers" on public.payment_receivers;
create policy "aqe_manager_write_payment_receivers"
on public.payment_receivers for all to authenticated
using (public.aqe_is_manager())
with check (public.aqe_is_manager());

insert into storage.buckets (id,name,public)
values ('manager-media','manager-media',true)
on conflict (id) do update set public=true;

drop policy if exists "aqe_manager_media_read" on storage.objects;
create policy "aqe_manager_media_read" on storage.objects for select to public
using (bucket_id='manager-media');

drop policy if exists "aqe_manager_media_insert" on storage.objects;
create policy "aqe_manager_media_insert" on storage.objects for insert to authenticated
with check (bucket_id='manager-media' and public.aqe_is_manager());

drop policy if exists "aqe_manager_media_update" on storage.objects;
create policy "aqe_manager_media_update" on storage.objects for update to authenticated
using (bucket_id='manager-media' and public.aqe_is_manager())
with check (bucket_id='manager-media' and public.aqe_is_manager());

drop policy if exists "aqe_manager_media_delete" on storage.objects;
create policy "aqe_manager_media_delete" on storage.objects for delete to authenticated
using (bucket_id='manager-media' and public.aqe_is_manager());

-- Manager-editable discovery filters. These are labels/configuration only;
-- server-side profile entitlement and authorization remain authoritative.
