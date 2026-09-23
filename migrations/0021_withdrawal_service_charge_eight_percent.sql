-- Withdrawal fee change: future/default withdrawal requests use 8%.
-- Completed historical requests remain unchanged.

ALTER TABLE public.vip_withdrawal_requests
  ALTER COLUMN service_charge_rate SET DEFAULT 0.08;

UPDATE public.vip_withdrawal_requests
SET
  service_charge_rate = 0.08,
  service_charge_amount = ROUND(amount * 0.08, 2),
  net_amount = ROUND(amount - (amount * 0.08), 2)
WHERE status = 'PENDING';

UPDATE public.platform_settings
SET settings = jsonb_set(
  jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{withdrawal,serviceChargeRate}',
    '0.08'::jsonb,
    true
  ),
  '{withdrawal,serviceChargeLabel}',
  '"8% withdrawal service charge"'::jsonb,
  true
)
WHERE id = 1;
