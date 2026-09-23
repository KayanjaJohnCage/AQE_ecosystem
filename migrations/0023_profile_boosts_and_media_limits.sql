-- Profile boosts and tier-controlled media limits.
-- Boosts can be granted by managers, purchased, or awarded by rewards/tasks/campaigns.

CREATE TABLE IF NOT EXISTS public.profile_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('manager','purchase','reward','task','campaign')),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','revoked')),
  label text,
  reason text,
  granted_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_boosts_active_idx
  ON public.profile_boosts (status, expires_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_boosts_user_idx
  ON public.profile_boosts (user_id, expires_at DESC);

ALTER TABLE public.profile_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_boosts_select_owner_or_manager ON public.profile_boosts;
CREATE POLICY profile_boosts_select_owner_or_manager
  ON public.profile_boosts FOR SELECT
  USING (user_id = auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS profile_boosts_update_manager ON public.profile_boosts;
CREATE POLICY profile_boosts_update_manager
  ON public.profile_boosts FOR UPDATE
  USING (public.is_aqe_manager())
  WITH CHECK (public.is_aqe_manager());

-- Store platform-controlled limits in the existing settings document.
UPDATE public.platform_settings
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'mediaLimits', jsonb_build_object(
    'basic', jsonb_build_object(
      'imagesPerMonth', 10,
      'videosPerMonth', 2,
      'maxImageSizeMB', 5,
      'maxVideoSizeMB', 75
    ),
    'premium', jsonb_build_object(
      'imagesPerMonth', 30,
      'videosPerMonth', 10,
      'maxImageSizeMB', 8,
      'maxVideoSizeMB', 100
    ),
    'vip', jsonb_build_object(
      'imagesPerMonth', 100,
      'videosPerMonth', 30,
      'maxImageSizeMB', 12,
      'maxVideoSizeMB', 150
    )
  ),
  'profileBoosts', jsonb_build_object(
    'enabled', true,
    'managerCanGrant', true,
    'purchaseEnabled', true,
    'rewardEnabled', true,
    'taskEnabled', true,
    'campaignEnabled', true,
    'defaultDurations', jsonb_build_object(
      'daily', 1,
      'weekly', 7,
      'monthly', 30
    )
  )
)
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.grant_profile_boost(
  p_user_id uuid,
  p_source text,
  p_duration_days integer,
  p_granted_by uuid DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starts timestamptz;
  v_expires timestamptz;
  v_boost public.profile_boosts%ROWTYPE;
BEGIN
  IF p_source NOT IN ('manager','purchase','reward','task','campaign') THEN
    RAISE EXCEPTION 'Invalid boost source.';
  END IF;

  IF p_duration_days IS NULL OR p_duration_days <= 0 OR p_duration_days > 365 THEN
    RAISE EXCEPTION 'Boost duration must be between 1 and 365 days.';
  END IF;

  SELECT GREATEST(now(), COALESCE(MAX(expires_at), now()))
  INTO v_starts
  FROM public.profile_boosts
  WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > now();

  v_expires := v_starts + make_interval(days => p_duration_days);

  INSERT INTO public.profile_boosts (
    user_id, source, duration_days, starts_at, expires_at,
    status, label, reason, granted_by, metadata
  )
  VALUES (
    p_user_id, p_source, p_duration_days, v_starts, v_expires,
    'active', NULLIF(trim(p_label), ''), NULLIF(trim(p_reason), ''),
    p_granted_by, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_boost;

  RETURN jsonb_build_object(
    'id', v_boost.id,
    'userId', v_boost.user_id,
    'source', v_boost.source,
    'durationDays', v_boost.duration_days,
    'startsAt', v_boost.starts_at,
    'expiresAt', v_boost.expires_at,
    'status', v_boost.status,
    'label', v_boost.label,
    'reason', v_boost.reason
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_profile_boost(uuid,text,integer,uuid,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_profile_boost(uuid,text,integer,uuid,text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_profile_boost(uuid,text,integer,uuid,text,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_profile_boost(uuid,text,integer,uuid,text,text,jsonb) TO service_role;
