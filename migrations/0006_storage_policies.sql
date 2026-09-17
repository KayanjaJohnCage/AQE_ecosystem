INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-media', 'profile-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS profile_media_storage_insert ON storage.objects;
CREATE POLICY profile_media_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS profile_media_storage_select ON storage.objects;
CREATE POLICY profile_media_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_aqe_manager()));

DROP POLICY IF EXISTS profile_media_storage_delete ON storage.objects;
CREATE POLICY profile_media_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_aqe_manager()));