-- Unified member withdrawals: payment destination details and tier-aware schedules.
-- Basic/Premium: Saturday + Sunday.
-- VIP: three configured withdrawal days per week (seeded Mon/Wed/Fri).

CREATE TABLE IF NOT EXISTS public.vip_withdrawal_schedule (
  day_of_week integer PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_withdrawal_day boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  cutoff_time time,
  processing_window text
);

INSERT INTO public.vip_withdrawal_schedule (day_of_week, is_withdrawal_day, is_active, processing_window)
VALUES
  (1, true, true, 'VIP withdrawal day'),
  (3, true, true, 'VIP withdrawal day'),
  (5, true, true, 'VIP withdrawal day')
ON CONFLICT (day_of_week) DO NOTHING;

ALTER TABLE public.vip_withdrawal_requests
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'vip',
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'MOBILE_MONEY',
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_account text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UGX';

UPDATE public.vip_withdrawal_requests
SET tier = 'vip'
WHERE tier IS NULL OR tier = '';

ALTER TABLE public.vip_withdrawal_requests
  DROP CONSTRAINT IF EXISTS vip_withdrawal_requests_tier_check;

ALTER TABLE public.vip_withdrawal_requests
  ADD CONSTRAINT vip_withdrawal_requests_tier_check
  CHECK (tier IN ('basic', 'premium', 'vip'));

ALTER TABLE public.vip_withdrawal_requests
  DROP CONSTRAINT IF EXISTS vip_withdrawal_requests_payment_method_check;

ALTER TABLE public.vip_withdrawal_requests
  ADD CONSTRAINT vip_withdrawal_requests_payment_method_check
  CHECK (payment_method IN ('AIRTEL_MONEY', 'MOBILE_MONEY', 'CARD'));

CREATE INDEX IF NOT EXISTS vip_withdrawal_requests_tier_status_idx
  ON public.vip_withdrawal_requests(tier, status);

CREATE INDEX IF NOT EXISTS vip_withdrawal_requests_created_at_idx
  ON public.vip_withdrawal_requests(created_at DESC);

ALTER TABLE public.vip_withdrawal_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_withdrawal_schedule_select_authenticated ON public.vip_withdrawal_schedule;
CREATE POLICY vip_withdrawal_schedule_select_authenticated
  ON public.vip_withdrawal_schedule FOR SELECT
  USING (auth.uid() IS NOT NULL OR public.is_aqe_manager());

DROP POLICY IF EXISTS vip_withdrawal_schedule_manager_write ON public.vip_withdrawal_schedule;
CREATE POLICY vip_withdrawal_schedule_manager_write
  ON public.vip_withdrawal_schedule FOR ALL
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());
