-- Manager-controlled customer experience configuration.
-- Existing frontend prototype values are intentionally used as initial reference data.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS customer_content jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.platform_settings
SET customer_content = COALESCE(customer_content, '{}'::jsonb) || jsonb_build_object(
  'home', jsonb_build_object(
    'heroKicker', 'VERIFIED PROFESSIONALS · SECURE PAYMENTS · DISCREET EXPERIENCE',
    'heroTitle', 'Discover Independence',
    'heroDescription', 'Verified professionals. Secure payments. Discreet experience.',
    'featuredTitle', 'Featured Profiles'
  ),
  'rewards', jsonb_build_object(
    'title', 'Rewards',
    'eyebrow', 'VIP ECOSYSTEM',
    'dailyClaimTitle', 'Daily claim',
    'dailyClaimDescription', 'Collect your daily QC reward.',
    'vipRewardTitle', '1 Week VIP',
    'vipRewardDescription', 'Redeem rewards after eligibility.',
    'raffleTitle', 'Raffle',
    'raffleDescription', 'Use QC for the active draw.'
  ),
  'campaign', jsonb_build_object(
    'enabled', false,
    'title', 'Welcome Campaign',
    'description', 'Invite friends and participate in AQE campaigns.',
    'rewardLabel', 'Campaign reward',
    'rewardAmount', 0,
    'currency', 'QC'
  ),
  'raffle', jsonb_build_object(
    'enabled', false,
    'title', 'AQE Raffle',
    'description', 'Use QC for the active draw.',
    'ticketCost', 0,
    'currency', 'QC',
    'prize', 'Prize to be configured',
    'winnerCount', 1
  ),
  'promotions', jsonb_build_object(
    'enabled', true,
    'bannerTitle', 'AQE Membership Promotion',
    'bannerText', 'Promotional membership pricing is controlled by the manager.',
    'displayDiscounts', true
  ),
  'vipContent', jsonb_build_object(
    'enabled', true,
    'subscriptionRequired', true,
    'title', 'VIP Locked Content',
    'description', 'Subscribe monthly or upgrade to VIP to unlock VIP content.'
  )
)
WHERE id = 1;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
