CREATE TABLE IF NOT EXISTS public.profile_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS profile_comments_profile_id_idx ON public.profile_comments(profile_id);
CREATE INDEX IF NOT EXISTS direct_messages_sender_id_idx ON public.direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_id_idx ON public.direct_messages(recipient_id);

ALTER TABLE public.profile_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_comments_select_public_or_manager ON public.profile_comments;
CREATE POLICY profile_comments_select_public_or_manager ON public.profile_comments FOR SELECT
  USING (true OR public.is_aqe_manager());

DROP POLICY IF EXISTS profile_comments_insert_authenticated ON public.profile_comments;
CREATE POLICY profile_comments_insert_authenticated ON public.profile_comments FOR INSERT
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS profile_comments_delete_author_or_manager ON public.profile_comments;
CREATE POLICY profile_comments_delete_author_or_manager ON public.profile_comments FOR DELETE
  USING (author_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS direct_messages_select_participant_or_manager ON public.direct_messages;
CREATE POLICY direct_messages_select_participant_or_manager ON public.direct_messages FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS direct_messages_insert_sender ON public.direct_messages;
CREATE POLICY direct_messages_insert_sender ON public.direct_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS direct_messages_update_recipient_or_manager ON public.direct_messages;
CREATE POLICY direct_messages_update_recipient_or_manager ON public.direct_messages FOR UPDATE
  USING (recipient_id = auth.uid() OR public.is_aqe_manager())
  WITH CHECK (recipient_id = auth.uid() OR public.is_aqe_manager());