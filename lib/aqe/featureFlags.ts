export type FeatureKey = 'invites' | 'my_team' | 'rewards' | 'raffle' | 'asset_room' | 'store'

export function getVipFeatureAccess(feature: FeatureKey, tier: 'basic' | 'premium' | 'vip') {
  const vipOnly: FeatureKey[] = ['invites', 'my_team', 'rewards', 'raffle', 'asset_room', 'store']

  if (tier === 'vip') {
    return { allowed: true, reason: 'VIP entitlement active.' }
  }

  if (vipOnly.includes(feature)) {
    return { allowed: false, reason: 'This feature is VIP-only. Upgrade to access it.' }
  }

  return { allowed: true, reason: 'Feature available for your current tier.' }
}
