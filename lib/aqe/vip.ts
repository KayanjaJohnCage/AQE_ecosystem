import { createServerSupabaseClient } from "../supabaseServer";

export type VipScheduleEntry = {
  dayOfWeek: number;
  isWithdrawalDay: boolean;
  isActive?: boolean;
  cutoffTime?: string;
  processingWindow?: string;
};

export function getConfiguredVipWithdrawalDays(
  schedule: VipScheduleEntry[],
): number[] {
  return schedule
    .filter((entry) => entry.isWithdrawalDay)
    .map((entry) => Number(entry.dayOfWeek));
}

export function isVipWithdrawalAllowed(
  schedule: VipScheduleEntry[],
  now = new Date(),
) {
  const dayOfWeek = now.getUTCDay();
  const allowedDays = getConfiguredVipWithdrawalDays(schedule);

  return {
    allowed: allowedDays.includes(dayOfWeek),
    dayOfWeek,
    allowedDays,
  };
}

export const DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE = 0.10;

export function calculateWithdrawalAmounts(amount: number, serviceChargeRate = DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE) {
  const grossAmount = Number(amount);
  const rate = Number(serviceChargeRate);
  const serviceChargeAmount = Math.round(grossAmount * rate * 100) / 100;
  const netAmount = Math.round((grossAmount - serviceChargeAmount) * 100) / 100;
  return { grossAmount, serviceChargeRate: rate, serviceChargeAmount, netAmount };
}

export function createVipWithdrawalRequest({
  userId,
  amount,
  schedule,
  now = new Date(),
}: {
  userId: string;
  amount: number;
  schedule: VipScheduleEntry[];
  now?: Date;
}) {
  const validation = isVipWithdrawalAllowed(schedule, now);

  if (!validation.allowed) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      reason: "VIP withdrawals are only allowed on configured withdrawal days.",
      allowedDays: validation.allowedDays,
    };
  }

  if (Number(amount) <= 0) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      reason: "Withdrawal amount must be greater than zero.",
    };
  }

  const amounts = calculateWithdrawalAmounts(amount);
  return {
    ok: true,
    status: "PENDING",
    userId,
    amount: amounts.grossAmount,
    ...amounts,
    requestId: `vip-withdrawal-${Date.now()}`,
    allowedDays: validation.allowedDays,
    message: "VIP withdrawal request created and submitted for review.",
  };
}

export async function createPersistedVipWithdrawalRequest({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}) {
  const client = createServerSupabaseClient();

  if (!client) {
    const result = createVipWithdrawalRequest({
      userId,
      amount,
      schedule: [
        { dayOfWeek: 1, isWithdrawalDay: true },
        { dayOfWeek: 3, isWithdrawalDay: true },
        { dayOfWeek: 5, isWithdrawalDay: true },
      ],
    });
    return { ...result, source: "memory" };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError)
    return { ok: false, status: "REJECTED", reason: profileError.message };
  if (profile?.tier !== "vip")
    return {
      ok: false,
      status: "REJECTED",
      reason: "VIP tier is required for withdrawals.",
    };

  const { data: settingsRow } = await client
    .from("platform_settings")
    .select("settings")
    .eq("id", 1)
    .maybeSingle();

  const configuredRate = Number(
    settingsRow?.settings?.withdrawal?.serviceChargeRate ?? DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE,
  );
  const serviceChargeRate =
    Number.isFinite(configuredRate) && configuredRate >= 0 && configuredRate <= 1
      ? configuredRate
      : DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE;

  const { data: scheduleRows, error: scheduleError } = await client
    .from("vip_withdrawal_schedule")
    .select(
      "day_of_week, is_withdrawal_day, is_active, cutoff_time, processing_window",
    )
    .eq("is_active", true);

  if (scheduleError)
    return { ok: false, status: "REJECTED", reason: scheduleError.message };

  const validation = createVipWithdrawalRequest({
    userId,
    amount,
    schedule: (scheduleRows ?? []).map((row) => ({
      dayOfWeek: row.day_of_week,
      isWithdrawalDay: row.is_withdrawal_day,
      isActive: row.is_active,
      cutoffTime: row.cutoff_time,
      processingWindow: row.processing_window,
    })),
  });

  if (!validation.ok) return { ...validation, source: "supabase" };

  const amounts = calculateWithdrawalAmounts(amount, serviceChargeRate);
  const { data: withdrawal, error: withdrawalError } = await client
    .from("vip_withdrawal_requests")
    .insert({
      user_id: userId,
      amount: amounts.grossAmount,
      service_charge_rate: amounts.serviceChargeRate,
      service_charge_amount: amounts.serviceChargeAmount,
      net_amount: amounts.netAmount,
      status: "PENDING",
    })
.select("id, user_id, amount, service_charge_rate, service_charge_amount, net_amount, status, created_at")
    .single();

  if (withdrawalError || !withdrawal) {
    return {
      ok: false,
      status: "REJECTED",
      reason:
        withdrawalError?.message ?? "Withdrawal request could not be saved.",
    };
  }

  return {
    ok: true,
    status: "PENDING",
    source: "supabase",
    requestId: withdrawal.id,
    userId: withdrawal.user_id,
    amount: withdrawal.amount,
    grossAmount: withdrawal.amount,
    serviceChargeRate: withdrawal.service_charge_rate,
    serviceChargeAmount: withdrawal.service_charge_amount,
    netAmount: withdrawal.net_amount,
    allowedDays: validation.allowedDays,
    message: "VIP withdrawal request created and submitted for review.",
  };
}
