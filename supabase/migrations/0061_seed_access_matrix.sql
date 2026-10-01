-- Seed the authoritative customer access feature catalog.
insert into public.feature_definitions(key,label,description,is_vip_only,is_active)
values
('dm_chat','Free DM access & chat','Direct messages and chat are available to all membership tiers.',false,true),
('profile_media','Profile photos & media','Available to all tiers; capacity differs by membership level.',false,true),
('wallet_deposit_withdraw','Wallet, deposit & withdraw','Available to all tiers subject to wallet and withdrawal rules.',false,true),
('earnings_activity','Earnings & recent activity','Available to all tiers.',false,true),
('bill_invite_support','Bill, invite & manager support','Available to all tiers.',false,true),
('team_referrals','My Team & referral tools','All tiers. Basic/Premium direct referrals earn 10%; VIP direct and indirect referrals earn 12%.',false,true),
('vip_tasks','VIP Tasks','VIP only.',true,true),
('rewards','Rewards','Available to all tiers.',false,true),
('premium_campaigns','Raffle, campaign, prizes & gifts','Premium and VIP only.',false,true),
('profile_boost','Profile boost','Available to all tiers.',false,true),
('multiple_withdrawals','Multiple withdrawals','VIP only.',true,true),
('groups_voice','Groups + voice','VIP only.',true,true),
('media_vault','Media Vault','VIP only.',true,true),
('store','Store','VIP only.',true,true),
('asset_room','Asset Room','VIP only; includes net worth and VIP salary withdrawal.',true,true),
('vip_content_subscription','Monthly VIP content unlock subscription','VIP only.',true,true)
on conflict(key) do update set label=excluded.label,description=excluded.description,is_vip_only=excluded.is_vip_only,is_active=excluded.is_active;