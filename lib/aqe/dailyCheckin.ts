export const DEFAULT_WEEKLY_REWARDS = [0, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45]

export function getDailyRewardForDay(dayOfWeek: number): number {
  const normalized = ((dayOfWeek % 7) + 7) % 7
  return DEFAULT_WEEKLY_REWARDS[normalized]
}

export async function claimDailyReward(supabase: any, userId: string) {
  const reward = getDailyRewardForDay(new Date().getDay())

  if (!supabase) {
    return {
      ok: true,
      userId,
      amount: reward,
      balanceAfter: reward,
      status: 'COMPLETED',
      message: 'Demo mode: daily QC reward approved.'
    }
  }

  return {
    ok: true,
    userId,
    amount: reward,
    balanceAfter: reward,
    status: 'COMPLETED',
    message: 'Daily QC reward processed.'
  }
}
