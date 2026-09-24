export const DEFAULT_WEEKLY_REWARDS = [0, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];

export function getDailyRewardForDay(dayOfWeek: number): number {
  const normalized = ((dayOfWeek % 7) + 7) % 7;
  return DEFAULT_WEEKLY_REWARDS[normalized];
}

export async function claimDailyReward(supabase: any, userId: string) {
  if (!supabase) {
    return {
      ok: false,
      userId,
      amount: 0,
      balanceAfter: 0,
      status: "FAILED",
      reason: "QC service is not configured.",
    };
  }

  const { data, error } = await supabase.rpc(
    "claim_daily_qc_reward_atomic",
    { p_user_id: userId },
  );

  if (error) {
    return {
      ok: false,
      userId,
      amount: 0,
      balanceAfter: 0,
      status: "FAILED",
      reason: error.message,
    };
  }

  return {
    ok: true,
    userId,
    amount: Number(data?.amount ?? 0),
    balanceAfter: Number(data?.balanceAfter ?? 0),
    status: "COMPLETED",
    alreadyClaimed: Boolean(data?.alreadyClaimed),
    claimDate: data?.claimDate ?? null,
    message: data?.alreadyClaimed
      ? "Daily QC reward has already been claimed today."
      : "Daily QC reward processed.",
  };
}
