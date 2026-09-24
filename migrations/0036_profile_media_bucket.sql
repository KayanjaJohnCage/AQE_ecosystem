-- Production storage bucket for profile media.
-- The bucket remains private; the application issues short-lived signed upload/read URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-media', 'profile-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;
