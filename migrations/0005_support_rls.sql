ALTER TABLE public.support_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_message ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_ticket_select_own_or_manager ON public.support_ticket;
CREATE POLICY support_ticket_select_own_or_manager
  ON public.support_ticket FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS support_ticket_insert_own ON public.support_ticket;
CREATE POLICY support_ticket_insert_own
  ON public.support_ticket FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS support_ticket_update_manager ON public.support_ticket;
CREATE POLICY support_ticket_update_manager
  ON public.support_ticket FOR UPDATE
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());

DROP POLICY IF EXISTS support_message_select_ticket_owner_or_manager ON public.support_message;
CREATE POLICY support_message_select_ticket_owner_or_manager
  ON public.support_message FOR SELECT
  USING (
    public.is_aqe_manager()
    OR EXISTS (
      SELECT 1
      FROM public.support_ticket
      WHERE support_ticket.id = support_message.ticket_id
        AND support_ticket.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_message_insert_sender ON public.support_message;
CREATE POLICY support_message_insert_sender
  ON public.support_message FOR INSERT
  WITH CHECK (sender_id = auth.uid());