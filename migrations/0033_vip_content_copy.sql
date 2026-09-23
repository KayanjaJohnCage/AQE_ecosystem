-- Correct manager-controlled VIP content copy so creator subscriptions are not confused with membership upgrades.
UPDATE public.platform_settings
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{customerContent,vipContent}',
  '{
    "enabled": true,
    "subscriptionRequired": true,
    "title": "VIP Locked Content",
    "description": "VIP creators can set a monthly content price. Viewers must subscribe to that VIP creator to unlock subscriber-only media for one full month."
  }'::jsonb,
  true
)
WHERE id = 1;
