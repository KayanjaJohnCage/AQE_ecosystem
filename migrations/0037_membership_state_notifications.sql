-- Membership state and in-app notifications.
-- A profile defaults to registered; a confirmed paid membership upgrade marks it upgraded.
-- This deliberately does not invent an expiry date because the business rules supplied
-- distinguish registration/upgrade from monthly renewal without defining membership expiry.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'registered'
    CHECK (membership_status IN ('registered','upgraded'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_activated_at timestamptz;

UPDATE public.profiles p
SET
  membership_status = 'upgraded',
  membership_activated_at = COALESCE(p.membership_activated_at, po.updated_at, now())
FROM LATERAL (
  SELECT updated_at
  FROM public.payment_orders
  WHERE user_id = p.user_id
    AND status = 'confirmed'
    AND lower(COALESCE(metadata->>'paymentKind', metadata->>'kind', '')) = 'membership_upgrade'
  ORDER BY updated_at DESC
  LIMIT 1
) po
WHERE po.updated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_membership_status_idx
  ON public.profiles (membership_status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.aqe_is_upgraded_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = p_user_id
      AND membership_status = 'upgraded'
  );
$$;

REVOKE ALL ON FUNCTION public.aqe_is_upgraded_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aqe_is_upgraded_member(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  reference_type text,
  reference_id text,
  dedupe_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_owner ON public.notifications;
CREATE POLICY notifications_select_owner
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_owner ON public.notifications;
CREATE POLICY notifications_update_owner
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.aqe_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_reference_type text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id, type, title, body, reference_type, reference_id,
    dedupe_key, metadata
  )
  VALUES (
    p_user_id, p_type, p_title, p_body, p_reference_type, p_reference_id,
    p_dedupe_key, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.aqe_notify(uuid,text,text,text,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aqe_notify(uuid,text,text,text,text,text,text,jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.aqe_membership_upgrade_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.membership_status IS DISTINCT FROM NEW.membership_status
     AND NEW.membership_status = 'upgraded' THEN
    PERFORM public.aqe_notify(
      NEW.user_id,
      'membership_upgrade',
      'Membership upgraded',
      'Your AQE membership has been upgraded to ' || upper(COALESCE(NEW.tier, 'basic')) || '.',
      'profile',
      NEW.user_id::text,
      'MEMBERSHIP-UPGRADE-' || NEW.user_id::text || '-' || COALESCE(NEW.membership_activated_at::text, now()::text),
      jsonb_build_object('tier', NEW.tier)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_membership_upgrade_notification ON public.profiles;
CREATE TRIGGER profile_membership_upgrade_notification
AFTER UPDATE OF membership_status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.aqe_membership_upgrade_notification();

CREATE OR REPLACE FUNCTION public.aqe_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.aqe_notify(
    NEW.recipient_id,
    'message',
    'New message',
    left(NEW.body, 180),
    'direct_message',
    NEW.id::text,
    'MESSAGE-' || NEW.id::text,
    jsonb_build_object('senderId', NEW.sender_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS direct_message_notification_trigger ON public.direct_messages;
CREATE TRIGGER direct_message_notification_trigger
AFTER INSERT ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION public.aqe_message_notification();

CREATE OR REPLACE FUNCTION public.aqe_booking_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.aqe_notify(
    NEW.customer_id,
    'booking_created',
    'Booking request submitted',
    'Your booking request for ' || NEW.service || ' has been submitted.',
    'booking',
    NEW.id::text,
    'BOOKING-CUSTOMER-' || NEW.id::text,
    jsonb_build_object('status', NEW.status, 'providerId', NEW.provider_id)
  );

  IF NEW.provider_id IS NOT NULL THEN
    PERFORM public.aqe_notify(
      NEW.provider_id,
      'booking_created',
      'New booking request',
      'You received a new booking request for ' || NEW.service || '.',
      'booking',
      NEW.id::text,
      'BOOKING-PROVIDER-' || NEW.id::text,
      jsonb_build_object('status', NEW.status, 'customerId', NEW.customer_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_notification_trigger ON public.bookings;
CREATE TRIGGER booking_notification_trigger
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.aqe_booking_notification();

CREATE OR REPLACE FUNCTION public.aqe_booking_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.aqe_notify(
      NEW.customer_id,
      'booking_status',
      'Booking status updated',
      'Your booking for ' || NEW.service || ' is now ' || NEW.status || '.',
      'booking',
      NEW.id::text,
      'BOOKING-STATUS-' || NEW.id::text || '-' || NEW.status,
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_status_notification_trigger ON public.bookings;
CREATE TRIGGER booking_status_notification_trigger
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.aqe_booking_status_notification();

-- Mark confirmed membership payments as upgraded. This is intentionally separate
-- from the profile tier trigger so the distinction is persisted even for Basic.
CREATE OR REPLACE FUNCTION public.aqe_payment_membership_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  v_kind := lower(COALESCE(NEW.metadata->>'paymentKind', NEW.metadata->>'kind', ''));
  IF NEW.status = 'confirmed' AND v_kind = 'membership_upgrade' THEN
    UPDATE public.profiles
    SET
      membership_status = 'upgraded',
      membership_activated_at = COALESCE(membership_activated_at, NEW.updated_at, now()),
      updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_membership_activation_trigger ON public.payment_orders;
CREATE TRIGGER payment_membership_activation_trigger
AFTER UPDATE OF status ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.aqe_payment_membership_activation();
