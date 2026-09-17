ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select_manager ON public.audit_log;
CREATE POLICY audit_log_select_manager
  ON public.audit_log FOR SELECT
  USING (public.is_aqe_manager());

DROP POLICY IF EXISTS audit_log_insert_authenticated ON public.audit_log;
CREATE POLICY audit_log_insert_authenticated
  ON public.audit_log FOR INSERT
  WITH CHECK (actor_id = auth.uid() OR public.is_aqe_manager());