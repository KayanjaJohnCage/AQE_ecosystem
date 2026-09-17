export type FeatureKey =
  | "invites"
  | "my_team"
  | "rewards"
  | "raffle"
  | "asset_room"
  | "store";

export const VIP_FEATURES: FeatureKey[] = [
  "invites",
  "my_team",
  "rewards",
  "raffle",
  "asset_room",
  "store",
];

export function isFeatureAvailableForTier(
  feature: FeatureKey,
  tier: "basic" | "premium" | "vip",
): boolean {
  if (tier === "vip") return true;
  return !VIP_FEATURES.includes(feature);
}

export function getUpgradePath(tier: "basic" | "premium" | "vip") {
  if (tier === "basic") return "Upgrade to Premium to unlock more access.";
  if (tier === "premium")
    return "Upgrade to VIP for invite, team, raffle, and asset room access.";
  return "You have full VIP access.";
}
