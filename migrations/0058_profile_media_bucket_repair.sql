-- Repair the production profile-media Storage bucket.
-- The application keeps this bucket private and uses server-issued signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-media', 'profile-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;
