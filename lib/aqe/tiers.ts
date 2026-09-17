export type AqeTier = 'basic' | 'premium' | 'vip'

export const TIER_PRIORITY: Record<AqeTier, number> = {
  basic: 1,
  premium: 2,
  vip: 3
}

export function isHigherTier(current: AqeTier, minimum: AqeTier): boolean {
  return TIER_PRIORITY[current] >= TIER_PRIORITY[minimum]
}

export function canAccessVipFeature(tier: AqeTier): boolean {
  return tier === 'vip'
}
