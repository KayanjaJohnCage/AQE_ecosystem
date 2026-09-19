CREATE TABLE IF NOT EXISTS public.platform_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_read_authenticated ON public.platform_settings;
CREATE POLICY platform_settings_read_authenticated
  ON public.platform_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS platform_settings_write_manager ON public.platform_settings;
CREATE POLICY platform_settings_write_manager
  ON public.platform_settings FOR ALL
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());
