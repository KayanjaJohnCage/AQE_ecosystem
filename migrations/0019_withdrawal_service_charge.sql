-- Withdrawal service charge: every withdrawal request is charged 10%.
-- The requested amount is the gross withdrawal; net amount is what the member receives.
ALTER TABLE public.vip_withdrawal_requests
  ADD COLUMN IF NOT EXISTS service_charge_rate numeric(5,4) NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS service_charge_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.vip_withdrawal_requests
SET service_charge_amount = ROUND(amount * service_charge_rate, 2),
    net_amount = ROUND(amount - (amount * service_charge_rate), 2)
WHERE net_amount = 0 AND amount > 0;

UPDATE public.platform_settings
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'withdrawal', jsonb_build_object(
    'serviceChargeRate', 0.10,
    'serviceChargeLabel', '10% withdrawal service charge'
  )
)
WHERE id = 1;
