-- Initial migration: Phase 1 economic schema

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  amount numeric,
  currency text,
  kind text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qc_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qc_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('IN', 'OUT')),
  balance_after numeric(12,2) NOT NULL,
  reference_type text,
  reference_id text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_checkin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  qc_reward numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS daily_checkin_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  qc_amount numeric(12,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (day_of_week)
);

CREATE TABLE IF NOT EXISTS cash_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available_balance numeric(12,2) NOT NULL DEFAULT 0,
  pending_balance numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_transaction_id text,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'ELIGIBLE' CHECK (status IN ('ELIGIBLE', 'PENDING', 'PAID', 'REVERSED')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vip_withdrawal_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_withdrawal_day boolean NOT NULL DEFAULT false,
  cutoff_time time,
  processing_window text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (day_of_week)
);

CREATE TABLE IF NOT EXISTS support_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'WAITING_FOR_MANAGER', 'RESOLVED', 'CLOSED')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  assigned_manager_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS support_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_ticket(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('USER', 'CREATOR', 'MANAGER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN')),
  message text NOT NULL,
  attachments jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
