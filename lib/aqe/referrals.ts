export type ReferralStatus = 'pending' | 'approved' | 'paid'

export function isReferralEligible({
  userTier,
  invitedCount,
  isVerified = false
}: {
  userTier: 'basic' | 'premium' | 'vip'
  invitedCount: number
  isVerified?: boolean
}) {
  const tierMultiplier = userTier === 'vip' ? 3 : userTier === 'premium' ? 2 : 1
  const requiredInvites = 1 * tierMultiplier

  return isVerified && invitedCount >= requiredInvites
}

export function createReferralReward({
  userTier,
  invitedCount,
  isVerified = false,
  rewardAmount = 25
}: {
  userTier: 'basic' | 'premium' | 'vip'
  invitedCount: number
  isVerified?: boolean
  rewardAmount?: number
}) {
  const eligible = isReferralEligible({ userTier, invitedCount, isVerified })

  if (!eligible) {
    return {
      ok: false,
      status: 'pending' as ReferralStatus,
      reason: 'Referral reward is not yet eligible.'
    }
  }

  return {
    ok: true,
    status: 'approved' as ReferralStatus,
    rewardAmount
  }
}
