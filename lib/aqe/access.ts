export type AqeMembershipTier = "free" | "basic" | "premium" | "vip";

export const AQE_ACCESS_MATRIX = {
  dm_chat: { free: true, basic: true, premium: true, vip: true },
  media_upload_limit: { free: null, basic: 10, premium: 20, vip: Infinity },
  wallet_deposit_withdraw: { free: true, basic: true, premium: true, vip: true },
  earnings_recent_activity: { free: true, basic: true, premium: true, vip: true },
  profile_photos_media: { free: true, basic: true, premium: true, vip: true },
  bill_invite_manager_support: { free: true, basic: true, premium: true, vip: true },
  team_referrals: { free: true, basic: true, premium: true, vip: true },
  referral_direct_rate: { free: 0, basic: 0.10, premium: 0.10, vip: 0.12 },
  referral_indirect_rate: { free: 0, basic: 0, premium: 0, vip: 0.12 },
  vip_tasks: { free: false, basic: false, premium: false, vip: true },
  rewards: { free: true, basic: true, premium: true, vip: true },
  raffle_campaign_prizes_gifts: { free: false, basic: false, premium: true, vip: true },
  profile_boost: { free: true, basic: true, premium: true, vip: true },
  multiple_withdrawals: { free: false, basic: false, premium: false, vip: true },
  groups_voice: { free: false, basic: false, premium: false, vip: true },
  media_vault: { free: false, basic: false, premium: false, vip: true },
  store: { free: false, basic: false, premium: false, vip: true },
  asset_room: { free: false, basic: false, premium: false, vip: true },
  vip_content_subscription: { free: false, basic: false, premium: false, vip: true },
} as const;

export function normalizeMembershipTier(value: unknown): AqeMembershipTier {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "vip") return "vip";
  if (v === "premium") return "premium";
  if (v === "basic") return "basic";
  return "free";
}

export function getAqeEntitlements(tier: unknown) {
  const normalized = normalizeMembershipTier(tier);
  const entries = Object.entries(AQE_ACCESS_MATRIX).map(([key, matrix]) => [
    key,
    matrix[normalized],
  ]);
  return {
    tier: normalized,
    can: Object.fromEntries(entries),
    referral: {
      directRate: AQE_ACCESS_MATRIX.referral_direct_rate[normalized],
      indirectRate: AQE_ACCESS_MATRIX.referral_indirect_rate[normalized],
    },
  };
}
