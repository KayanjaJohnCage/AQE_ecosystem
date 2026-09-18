CREATE TABLE IF NOT EXISTS public.payment_receiver_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  receiver_name text NOT NULL,
  receiver_phone text NOT NULL,
  receiver_card text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_receiver_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_receiver_settings_select_authenticated ON public.payment_receiver_settings;
CREATE POLICY payment_receiver_settings_select_authenticated
  ON public.payment_receiver_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS payment_receiver_settings_write_manager ON public.payment_receiver_settings;
CREATE POLICY payment_receiver_settings_write_manager
  ON public.payment_receiver_settings FOR ALL
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());
