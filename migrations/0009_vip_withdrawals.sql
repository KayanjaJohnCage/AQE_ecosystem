CREATE TABLE IF NOT EXISTS public.vip_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reason text
);

CREATE INDEX IF NOT EXISTS vip_withdrawal_requests_user_id_idx ON public.vip_withdrawal_requests(user_id);

ALTER TABLE public.vip_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vip_withdrawals_select_own_or_manager ON public.vip_withdrawal_requests;
CREATE POLICY vip_withdrawals_select_own_or_manager
  ON public.vip_withdrawal_requests FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS vip_withdrawals_insert_own ON public.vip_withdrawal_requests;
CREATE POLICY vip_withdrawals_insert_own
  ON public.vip_withdrawal_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS vip_withdrawals_update_manager ON public.vip_withdrawal_requests;
CREATE POLICY vip_withdrawals_update_manager
  ON public.vip_withdrawal_requests FOR UPDATE
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());