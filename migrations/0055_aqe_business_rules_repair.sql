-- 0055 AQE business-rule repair
-- Restore the CEO-provided renewal prices and tier-dependent referral rates.
update public.platform_settings
set settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(settings,'{}'::jsonb),
      '{renewalPrices}',
      '{"basic":2500,"premium":5000,"vip":8500}'::jsonb,
      true
    ),
    '{referralRates}',
    '{"direct":0.10,"indirect":0.05}'::jsonb,
    true
  ),
  '{referralRatesByTier}',
  '{"basic":{"direct":0.10,"indirect":0.05},"premium":{"direct":0.10,"indirect":0.05},"vip":{"direct":0.12,"indirect":0.12}}'::jsonb,
  true
),
updated_at=now()
where id=1;