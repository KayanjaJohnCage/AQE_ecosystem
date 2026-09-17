ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'manager', 'admin')),
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'premium', 'vip')),
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('unverified', 'pending', 'approved', 'rejected', 'resubmission_required')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx ON profiles (user_id);

UPDATE profiles
SET role = 'customer', tier = 'basic', verification_status = 'pending', updated_at = now()
WHERE role IS NULL OR tier IS NULL OR verification_status IS NULL;
