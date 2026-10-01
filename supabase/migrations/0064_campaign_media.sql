alter table public.campaigns add column if not exists image_path text;
alter table public.campaigns add column if not exists image_url text;
alter table public.campaign_gift_packages add column if not exists image_path text;
alter table public.campaign_gift_packages add column if not exists image_url text;