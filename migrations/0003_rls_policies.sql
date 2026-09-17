-- Server-enforced access rules for Supabase Auth users.

CREATE OR REPLACE FUNCTION public.is_aqe_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role_name IN ('manager', 'admin')
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_manager ON public.profiles;
CREATE POLICY profiles_select_own_or_manager
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own_or_manager ON public.profiles;
CREATE POLICY profiles_update_own_or_manager
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid() OR public.is_aqe_manager())
  WITH CHECK (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS user_roles_select_own_or_manager ON public.user_roles;
CREATE POLICY user_roles_select_own_or_manager
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS profile_media_select_owner_or_manager ON public.profile_media;
CREATE POLICY profile_media_select_owner_or_manager
  ON public.profile_media FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_aqe_manager() OR visibility = 'public');

DROP POLICY IF EXISTS profile_media_insert_owner ON public.profile_media;
CREATE POLICY profile_media_insert_owner
  ON public.profile_media FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS profile_media_update_owner_or_manager ON public.profile_media;
CREATE POLICY profile_media_update_owner_or_manager
  ON public.profile_media FOR UPDATE
  USING (owner_user_id = auth.uid() OR public.is_aqe_manager())
  WITH CHECK (owner_user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS feature_entitlements_select_own_or_manager ON public.feature_entitlements;
CREATE POLICY feature_entitlements_select_own_or_manager
  ON public.feature_entitlements FOR SELECT
  USING (
    public.is_aqe_manager()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = feature_entitlements.profile_id
        AND profiles.user_id = auth.uid()
    )
  );
