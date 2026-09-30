-- AQE SYSTEM DATABASE RECONCILIATION
-- Canonical repair for the fragmented legacy public migrations.
-- Safe to run against the existing production database:
--   * uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--   * does not delete customer/payment data
--   * uses auth/profile UUIDs rather than the legacy public.users FK model
-- Run this once in Supabase SQL Editor, then verify the post-checks at the end.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------
-- Identity / profile compatibility
-- ------------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS content_categories text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS social_platforms jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_methods jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Africa/Kampala',
  ADD COLUMN IF NOT EXISTS identity_last_changed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx
  ON public.profiles(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique_idx
  ON public.profiles(referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
  ON public.profiles(referred_by);

-- ------------------------------------------------------------------
-- Core roles / legacy-compatible support foundation
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles(name) VALUES ('customer'),('manager'),('admin')
ON CONFLICT(name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_name text NOT NULL REFERENCES public.roles(name) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,role_name)
);

CREATE TABLE IF NOT EXISTS public.feature_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_vip_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,feature_key)
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  amount numeric,
  currency text,
  kind text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_checkin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  qc_reward numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,date)
);

CREATE TABLE IF NOT EXISTS public.daily_checkin_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  qc_amount numeric(12,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day_of_week)
);

CREATE TABLE IF NOT EXISTS public.creator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  source_transaction_id text,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'ELIGIBLE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  priority text NOT NULL DEFAULT 'MEDIUM',
  assigned_manager_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.support_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL,
  message text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------
-- Payment orders
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (char_length(currency)=3),
  qc_package_id text,
  reference text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'manager',
  mode text NOT NULL DEFAULT 'mock'
    CHECK (mode IN ('mock','live')),
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','pending','confirmed','rejected','cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS qc_package_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS payment_orders_user_status_idx
  ON public.payment_orders(user_id,status,created_at DESC);

-- ------------------------------------------------------------------
-- Wallets and ledgers
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  available_balance numeric(12,2) NOT NULL DEFAULT 0,
  pending_balance numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UGX',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_wallet
  ADD COLUMN IF NOT EXISTS available_balance numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_balance numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.cash_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  payment_order_id uuid,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
  currency text NOT NULL CHECK (char_length(currency)=3),
  balance_after numeric(12,2) NOT NULL,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,payment_order_id,direction)
);

CREATE TABLE IF NOT EXISTS public.qc_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qc_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  direction text NOT NULL CHECK(direction IN ('IN','OUT')),
  balance_after numeric(12,2) NOT NULL,
  reference_type text,
  reference_id text,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'COMPLETED'
    CHECK(status IN ('PENDING','COMPLETED','FAILED')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  payment_order_id uuid NOT NULL,
  relationship_level integer NOT NULL CHECK(relationship_level IN(1,2)),
  rate numeric(6,4) NOT NULL CHECK(rate >= 0 AND rate <= 1),
  amount numeric(12,2) NOT NULL CHECK(amount > 0),
  currency text NOT NULL CHECK(char_length(currency)=3),
  status text NOT NULL DEFAULT 'CREDITED'
    CHECK(status IN('CREDITED','REVERSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(beneficiary_user_id,payment_order_id,relationship_level)
);

-- ------------------------------------------------------------------
-- Platform configuration / membership records / receipts
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id integer PRIMARY KEY CHECK(id=1),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings(id,settings)
VALUES(
  1,
  jsonb_build_object(
    'walletCurrency','UGX',
    'referralRates',jsonb_build_object('direct',0.10,'indirect',0.05),
    'referralRatesByTier',jsonb_build_object(
      'basic',jsonb_build_object('direct',0.10,'indirect',0.05),
      'premium',jsonb_build_object('direct',0.10,'indirect',0.05),
      'vip',jsonb_build_object('direct',0.12,'indirect',0.12)
    )
  )
)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier text NOT NULL CHECK(tier IN('basic','premium','vip')),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN('active','cancelled','expired','pending')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  amount numeric(12,2) NOT NULL CHECK(amount >= 0),
  currency text NOT NULL CHECK(char_length(currency)=3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  transaction_type text NOT NULL,
  source text NOT NULL,
  reference_id text,
  amount numeric(12,2),
  currency text,
  qc_amount numeric(12,2),
  cash_amount numeric(12,2),
  boost_days integer,
  balance_before numeric(12,2),
  balance_after numeric(12,2),
  status text NOT NULL DEFAULT 'COMPLETED'
    CHECK(status IN('PENDING','COMPLETED','FAILED','REVERSED','CANCELLED')),
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.aqe_receipt_number()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'AQE-' ||
    to_char(now() AT TIME ZONE 'Africa/Kampala','YYYYMMDDHH24MISS') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
END;
$$;

-- ------------------------------------------------------------------
-- Media / discovery / commerce / communication
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK(media_type IN('image','video')),
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 1 CHECK(file_size > 0),
  visibility text NOT NULL DEFAULT 'public'
    CHECK(visibility IN('public','private','restricted')),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK(moderation_status IN('pending','approved','rejected','flagged')),
  is_profile_photo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL CHECK(source IN('manager','purchase','reward','task','campaign')),
  duration_days integer NOT NULL CHECK(duration_days > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN('active','expired','revoked')),
  label text,
  reason text,
  granted_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  service text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK(amount > 0),
  currency text NOT NULL CHECK(char_length(currency)=3),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN('pending','accepted','rejected','cancelled','completed','disputed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  title text NOT NULL,
  price numeric(12,2) NOT NULL CHECK(price > 0),
  currency text NOT NULL CHECK(char_length(currency)=3),
  inventory integer NOT NULL DEFAULT 1 CHECK(inventory >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

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

-- ------------------------------------------------------------------
-- Payments receiver / withdrawals
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_receiver_settings (
  id integer PRIMARY KEY CHECK(id=1),
  receiver_name text NOT NULL DEFAULT '',
  receiver_phone text NOT NULL DEFAULT '',
  receiver_card text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK(amount > 0),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK(status IN('PENDING','APPROVED','REJECTED','PAID','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reason text
);

CREATE TABLE IF NOT EXISTS public.vip_withdrawal_schedule (
  day_of_week integer PRIMARY KEY CHECK(day_of_week BETWEEN 0 AND 6),
  is_withdrawal_day boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  cutoff_time time,
  processing_window text
);

-- ------------------------------------------------------------------
-- Campaigns / prizes / VIP content / VIP salary
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK(status IN('draft','active','paused','completed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  qc_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_currency text NOT NULL DEFAULT 'UGX',
  boost_days integer NOT NULL DEFAULT 0,
  boost_label text,
  usage_limit integer,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  eligibility_tiers text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_gift_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  qc_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_currency text NOT NULL DEFAULT 'UGX',
  boost_days integer NOT NULL DEFAULT 0,
  boost_label text,
  quantity integer,
  claimed_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  eligibility_tiers text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code_id uuid,
  package_id uuid,
  qc_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_currency text,
  boost_days integer NOT NULL DEFAULT 0,
  receipt_id uuid,
  status text NOT NULL DEFAULT 'COMPLETED',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_content_settings (
  vip_user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  monthly_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UGX',
  title text NOT NULL DEFAULT 'VIP Content',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_content_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id uuid NOT NULL,
  vip_user_id uuid NOT NULL,
  payment_order_id uuid UNIQUE,
  amount numeric NOT NULL CHECK(amount > 0),
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN('active','expired','cancelled')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_asset_rooms (
  user_id uuid PRIMARY KEY,
  salary_balance numeric NOT NULL DEFAULT 0,
  withdrawn_salary_total numeric NOT NULL DEFAULT 0,
  pin_hash text,
  pin_set_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vip_salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period text NOT NULL,
  invite_count integer NOT NULL DEFAULT 0,
  salary_per_invite numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'credited',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,period)
);

CREATE TABLE IF NOT EXISTS public.vip_asset_room_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aqe_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL UNIQUE,
  title text NOT NULL,
  invite_requirement integer NOT NULL CHECK(invite_requirement > 0),
  tier_scope text NOT NULL DEFAULT 'vip',
  reward_type text NOT NULL DEFAULT 'physical',
  reward_description text,
  cash_value numeric,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aqe_prize_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id uuid NOT NULL,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'physical',
  status text NOT NULL DEFAULT 'pending',
  cash_amount numeric,
  manager_note text,
  approved_by uuid,
  approved_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prize_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.daily_qc_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  claim_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,claim_date)
);

CREATE TABLE IF NOT EXISTS public.account_troubleshoot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_change text NOT NULL,
  details text NOT NULL,
  qc_charge numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz
);

-- ------------------------------------------------------------------
-- Existing-user wallet bootstrap
-- ------------------------------------------------------------------
INSERT INTO public.cash_wallet(user_id,available_balance,pending_balance,currency)
SELECT p.user_id,0,0,'UGX'
FROM public.profiles p
WHERE p.user_id IS NOT NULL
ON CONFLICT(user_id) DO NOTHING;

-- ------------------------------------------------------------------
-- Atomic membership/payment confirmation
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_payment_order_atomic(
  p_order_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_kind text;
  v_tier text;
  v_direct uuid;
  v_indirect uuid;
  v_direct_tier text;
  v_indirect_tier text;
  v_direct_rate numeric := 0.10;
  v_indirect_rate numeric := 0.05;
  v_settings jsonb;
  v_rates jsonb;
  v_amount numeric;
  v_wallet public.cash_wallet%ROWTYPE;
  v_qc numeric;
  v_qc_after numeric;
BEGIN
  IF p_order_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Payment order and manager actor are required';
  END IF;

  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found';
  END IF;

  IF v_order.status = 'confirmed' THEN
    RETURN jsonb_build_object(
      'alreadyConfirmed',true,
      'status','confirmed',
      'orderId',v_order.id
    );
  END IF;

  IF v_order.status NOT IN ('initiated','pending') THEN
    RAISE EXCEPTION
      'Payment order cannot be confirmed from status %',
      v_order.status;
  END IF;

  v_kind := lower(
    coalesce(
      v_order.metadata->>'paymentKind',
      v_order.metadata->>'kind',
      'membership_upgrade'
    )
  );

  v_tier := lower(
    coalesce(
      v_order.metadata->>'requestedTier',
      'basic'
    )
  );

  IF v_tier NOT IN ('basic','premium','vip') THEN
    v_tier := 'basic';
  END IF;

  SELECT settings INTO v_settings
  FROM public.platform_settings
  WHERE id=1;

  v_rates :=
    coalesce(
      v_settings->'referralRatesByTier'->v_tier,
      '{}'::jsonb
    );

  v_direct_rate := coalesce(
    (v_rates->>'direct')::numeric,
    (v_settings->'referralRates'->>'direct')::numeric,
    CASE WHEN v_tier='vip' THEN 0.12 ELSE 0.10 END
  );

  v_indirect_rate := coalesce(
    (v_rates->>'indirect')::numeric,
    (v_settings->'referralRates'->>'indirect')::numeric,
    CASE WHEN v_tier='vip' THEN 0.12 ELSE 0.05 END
  );

  UPDATE public.payment_orders
  SET status='confirmed',
      updated_at=now()
  WHERE id=v_order.id;

  IF v_kind='membership_upgrade' THEN

    UPDATE public.profiles
    SET tier=v_tier,
        verification_status='approved',
        updated_at=now()
    WHERE user_id=v_order.user_id;

    INSERT INTO public.cash_wallet(
      user_id,available_balance,pending_balance,currency
    )
    VALUES(v_order.user_id,0,0,v_order.currency)
    ON CONFLICT(user_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.cash_wallet
    WHERE user_id=v_order.user_id
    FOR UPDATE;

    -- Membership payment is recorded in the receipt/ledger as a payment event.
    INSERT INTO public.cash_wallet_ledger(
      user_id,payment_order_id,amount,direction,currency,
      balance_after,reference_type,reference_id
    )
    VALUES(
      v_order.user_id,v_order.id,v_order.amount,'CREDIT',
      v_order.currency,
      v_wallet.available_balance + v_order.amount,
      'MEMBERSHIP_PAYMENT',
      v_order.reference
    )
    ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

    UPDATE public.cash_wallet
    SET available_balance=available_balance + v_order.amount,
        currency=v_order.currency,
        updated_at=now()
    WHERE user_id=v_order.user_id;

    SELECT referred_by INTO v_direct
    FROM public.profiles
    WHERE user_id=v_order.user_id;

    IF v_direct IS NOT NULL THEN

      SELECT tier INTO v_direct_tier
      FROM public.profiles
      WHERE user_id=v_direct;

      v_rates := coalesce(
        v_settings->'referralRatesByTier'->coalesce(v_direct_tier,'basic'),
        '{}'::jsonb
      );

      v_direct_rate := coalesce(
        (v_rates->>'direct')::numeric,
        (v_settings->'referralRates'->>'direct')::numeric,
        CASE WHEN coalesce(v_direct_tier,'basic')='vip' THEN 0.12 ELSE 0.10 END
      );

      v_amount := round(v_order.amount*v_direct_rate,2);

      IF v_amount > 0 THEN
        INSERT INTO public.referral_earnings(
          beneficiary_user_id,referred_user_id,payment_order_id,
          relationship_level,rate,amount,currency
        )
        VALUES(
          v_direct,v_order.user_id,v_order.id,
          1,v_direct_rate,v_amount,v_order.currency
        )
        ON CONFLICT(
          beneficiary_user_id,payment_order_id,relationship_level
        ) DO NOTHING;

        INSERT INTO public.cash_wallet(
          user_id,available_balance,pending_balance,currency
        )
        VALUES(v_direct,v_amount,0,v_order.currency)
        ON CONFLICT(user_id) DO UPDATE
        SET available_balance =
              public.cash_wallet.available_balance + EXCLUDED.available_balance,
            currency=EXCLUDED.currency,
            updated_at=now();

        SELECT available_balance INTO v_wallet.available_balance
        FROM public.cash_wallet
        WHERE user_id=v_direct;

        INSERT INTO public.cash_wallet_ledger(
          user_id,payment_order_id,amount,direction,currency,
          balance_after,reference_type,reference_id
        )
        VALUES(
          v_direct,v_order.id,v_amount,'CREDIT',v_order.currency,
          v_wallet.available_balance,'DIRECT_REFERRAL_EARNING',v_order.reference
        )
        ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;
      END IF;

      SELECT referred_by INTO v_indirect
      FROM public.profiles
      WHERE user_id=v_direct;

      IF v_indirect IS NOT NULL THEN

        SELECT tier INTO v_indirect_tier
        FROM public.profiles
        WHERE user_id=v_indirect;

        v_rates := coalesce(
          v_settings->'referralRatesByTier'->coalesce(v_indirect_tier,'basic'),
          '{}'::jsonb
        );

        v_indirect_rate := coalesce(
          (v_rates->>'indirect')::numeric,
          (v_settings->'referralRates'->>'indirect')::numeric,
          CASE WHEN coalesce(v_indirect_tier,'basic')='vip' THEN 0.12 ELSE 0.05 END
        );

        v_amount := round(v_order.amount*v_indirect_rate,2);

        IF v_amount > 0 THEN
          INSERT INTO public.referral_earnings(
            beneficiary_user_id,referred_user_id,payment_order_id,
            relationship_level,rate,amount,currency
          )
          VALUES(
            v_indirect,v_order.user_id,v_order.id,
            2,v_indirect_rate,v_amount,v_order.currency
          )
          ON CONFLICT(
            beneficiary_user_id,payment_order_id,relationship_level
          ) DO NOTHING;

          INSERT INTO public.cash_wallet(
            user_id,available_balance,pending_balance,currency
          )
          VALUES(v_indirect,v_amount,0,v_order.currency)
          ON CONFLICT(user_id) DO UPDATE
          SET available_balance =
                public.cash_wallet.available_balance + EXCLUDED.available_balance,
              currency=EXCLUDED.currency,
              updated_at=now();

          SELECT available_balance INTO v_wallet.available_balance
          FROM public.cash_wallet
          WHERE user_id=v_indirect;

          INSERT INTO public.cash_wallet_ledger(
            user_id,payment_order_id,amount,direction,currency,
            balance_after,reference_type,reference_id
          )
          VALUES(
            v_indirect,v_order.id,v_amount,'CREDIT',v_order.currency,
            v_wallet.available_balance,'INDIRECT_REFERRAL_EARNING',v_order.reference
          )
          ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;
        END IF;
      END IF;
    END IF;

  ELSIF v_kind='wallet_deposit' THEN

    INSERT INTO public.cash_wallet(
      user_id,available_balance,pending_balance,currency
    )
    VALUES(v_order.user_id,0,0,v_order.currency)
    ON CONFLICT(user_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.cash_wallet
    WHERE user_id=v_order.user_id
    FOR UPDATE;

    UPDATE public.cash_wallet
    SET available_balance=available_balance+v_order.amount,
        currency=v_order.currency,
        updated_at=now()
    WHERE user_id=v_order.user_id;

    INSERT INTO public.cash_wallet_ledger(
      user_id,payment_order_id,amount,direction,currency,
      balance_after,reference_type,reference_id
    )
    VALUES(
      v_order.user_id,v_order.id,v_order.amount,'CREDIT',
      v_order.currency,
      v_wallet.available_balance+v_order.amount,
      'WALLET_DEPOSIT',v_order.reference
    )
    ON CONFLICT(user_id,payment_order_id,direction) DO NOTHING;

  ELSIF v_kind='qc_recharge' THEN

    v_qc := NULLIF(v_order.metadata->>'qcAmount','')::numeric;

    IF coalesce(v_qc,0) <= 0 THEN
      RAISE EXCEPTION 'QC amount is missing from the payment order';
    END IF;

    INSERT INTO public.qc_wallet(user_id,balance)
    VALUES(v_order.user_id,0)
    ON CONFLICT(user_id) DO NOTHING;

    SELECT balance INTO v_qc_after
    FROM public.qc_wallet
    WHERE user_id=v_order.user_id
    FOR UPDATE;

    v_qc_after := coalesce(v_qc_after,0)+v_qc;

    UPDATE public.qc_wallet
    SET balance=v_qc_after,
        updated_at=now()
    WHERE user_id=v_order.user_id;

    INSERT INTO public.qc_ledger(
      user_id,transaction_type,amount,direction,balance_after,
      reference_type,reference_id,description,status,metadata
    )
    VALUES(
      v_order.user_id,'qc_recharge',v_qc,'IN',v_qc_after,
      'payment',v_order.id::text,'QC recharge','COMPLETED',
      jsonb_build_object(
        'paymentOrderId',v_order.id,
        'paymentAmount',v_order.amount,
        'currency',v_order.currency
      )
    );

  ELSIF v_kind='subscription_renewal' THEN

    INSERT INTO public.subscriptions(
      user_id,tier,status,started_at,expires_at,amount,currency
    )
    VALUES(
      v_order.user_id,v_tier,'active',now(),
      now()+interval '30 days',
      v_order.amount,v_order.currency
    );

    UPDATE public.profiles
    SET tier=v_tier,
        verification_status='approved',
        updated_at=now()
    WHERE user_id=v_order.user_id;

  ELSE
    RAISE EXCEPTION 'Unsupported payment kind: %',v_kind;
  END IF;

  RETURN jsonb_build_object(
    'alreadyConfirmed',false,
    'status','confirmed',
    'paymentKind',v_kind,
    'amount',v_order.amount,
    'currency',v_order.currency,
    'upgradedTier',
      CASE WHEN v_kind IN('membership_upgrade','subscription_renewal')
           THEN v_tier ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_payment_order_atomic(uuid,uuid)
TO service_role;

-- Membership verification trigger is kept independent so a confirmed
-- payment always results in an approved membership record.
CREATE OR REPLACE FUNCTION public.apply_membership_payment_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  k text;
  t text;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' AND OLD.status='confirmed' THEN
    RETURN NEW;
  END IF;

  k := lower(coalesce(
    NEW.metadata->>'paymentKind',
    NEW.metadata->>'payment_kind',
    ''
  ));

  t := lower(coalesce(
    NEW.metadata->>'requestedTier',
    NEW.metadata->>'requested_tier',
    ''
  ));

  IF k IN('membership_upgrade','subscription_renewal')
     AND t IN('basic','premium','vip') THEN
    UPDATE public.profiles
    SET tier=t,
        verification_status='approved',
        updated_at=now()
    WHERE user_id=NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_orders_membership_verification
ON public.payment_orders;

CREATE TRIGGER payment_orders_membership_verification
AFTER UPDATE OF status ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.apply_membership_payment_verification();

-- ------------------------------------------------------------------
-- Security / schema cache
-- ------------------------------------------------------------------
ALTER TABLE public.cash_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_wallet_select_own_or_manager
ON public.cash_wallet;

CREATE POLICY cash_wallet_select_own_or_manager
ON public.cash_wallet
FOR SELECT
USING(user_id=auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS cash_wallet_ledger_select_own_or_manager
ON public.cash_wallet_ledger;

CREATE POLICY cash_wallet_ledger_select_own_or_manager
ON public.cash_wallet_ledger
FOR SELECT
USING(user_id=auth.uid() OR public.is_aqe_manager());

DROP POLICY IF EXISTS referral_earnings_select_own_or_manager
ON public.referral_earnings;

CREATE POLICY referral_earnings_select_own_or_manager
ON public.referral_earnings
FOR SELECT
USING(
  beneficiary_user_id=auth.uid()
  OR public.is_aqe_manager()
);

GRANT ALL ON TABLE public.cash_wallet TO service_role;
GRANT ALL ON TABLE public.cash_wallet_ledger TO service_role;
GRANT ALL ON TABLE public.referral_earnings TO service_role;
GRANT ALL ON TABLE public.payment_orders TO service_role;
GRANT ALL ON TABLE public.subscriptions TO service_role;
GRANT ALL ON TABLE public.transaction_receipts TO service_role;

NOTIFY pgrst,'reload schema';

-- ------------------------------------------------------------------
-- FINAL POST-REPAIR CHECK
-- ------------------------------------------------------------------
SELECT
  object_name,
  object_type,
  CASE
    WHEN object_type='table'
      THEN to_regclass('public.'||object_name)::text
    WHEN object_type='function'
      THEN (
        SELECT n.nspname||'.'||p.proname||'('||
               pg_get_function_identity_arguments(p.oid)||')'
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public'
          AND p.proname=object_name
        LIMIT 1
      )
  END AS found_object
FROM (
  VALUES
    ('profiles','table'),
    ('payment_orders','table'),
    ('cash_wallet','table'),
    ('cash_wallet_ledger','table'),
    ('qc_wallet','table'),
    ('qc_ledger','table'),
    ('referral_earnings','table'),
    ('platform_settings','table'),
    ('subscriptions','table'),
    ('transaction_receipts','table'),
    ('profile_media','table'),
    ('profile_boosts','table'),
    ('bookings','table'),
    ('marketplace_products','table'),
    ('direct_messages','table'),
    ('notifications','table'),
    ('confirm_payment_order_atomic','function'),
    ('apply_membership_payment_verification','function'),
    ('is_aqe_manager','function')
) x(object_name,object_type)
ORDER BY object_type,object_name;
