-- Allow active VIP creator-content subscribers to read subscriber-only media metadata.
-- The application still withholds signed storage URLs unless access is valid.

DROP POLICY IF EXISTS profile_media_select_public_or_owner ON public.profile_media;
CREATE POLICY profile_media_select_public_or_owner
  ON public.profile_media FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR public.is_aqe_manager()
    OR (
      visibility = 'public'
      AND moderation_status = 'approved'
      AND (
        content_access = 'public'
        OR public.has_active_vip_content_subscription(auth.uid(), owner_user_id)
      )
    )
  );
