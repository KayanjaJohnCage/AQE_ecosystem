import { createServerSupabaseClient } from "../supabaseServer";

export type WithdrawalTier = "basic" | "premium" | "vip";

export type VipScheduleEntry = {
  dayOfWeek: number;
  isWithdrawalDay: boolean;
  isActive?: boolean;
  cutoffTime?: string;
  processingWindow?: string;
};

const EAST_AFRICA_TIME_ZONE = "Africa/Kampala";

export function getConfiguredVipWithdrawalDays(
  schedule: VipScheduleEntry[],
): number[] {
  return schedule
    .filter((entry) => entry.isWithdrawalDay && entry.isActive !== false)
    .map((entry) => Number(entry.dayOfWeek))
    .filter((day) => day >= 0 && day <= 6);
}

function getEastAfricaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EAST_AFRICA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    dayOfWeek: weekdayMap[get("weekday")] ?? now.getUTCDay(),
  };
}

export function getWithdrawalDayPolicy(
  tier: WithdrawalTier,
  schedule: VipScheduleEntry[],
) {
  if (tier === "basic" || tier === "premium") {
    return {
      allowedDays: [0, 6],
      labels: ["Sunday", "Saturday"],
      rule: "Basic and Premium withdrawals are available on weekends only.",
    };
  }

  const allowedDays = getConfiguredVipWithdrawalDays(schedule);
  const fallbackDays = allowedDays.length === 3 ? allowedDays : [1, 3, 5];

  return {
    allowedDays: fallbackDays,
    labels: fallbackDays.map((day) =>
      ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
    ),
    rule: "VIP withdrawals are available on three configured days each week.",
  };
}

export function isVipWithdrawalAllowed(
  schedule: VipScheduleEntry[],
  now = new Date(),
  tier: WithdrawalTier = "vip",
) {
  const date = getEastAfricaDateParts(now);
  const policy = getWithdrawalDayPolicy(tier, schedule);

  return {
    allowed: policy.allowedDays.includes(date.dayOfWeek),
    dayOfWeek: date.dayOfWeek,
    allowedDays: policy.allowedDays,
    labels: policy.labels,
    rule: policy.rule,
    eastAfricaDay: date.day,
  };
}

export const DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE = 0.08;

export function calculateWithdrawalAmounts(
  amount: number,
  serviceChargeRate = DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE,
) {
  const grossAmount = Number(amount);
  const rate = Number(serviceChargeRate);
  const serviceChargeAmount =
    Math.round(grossAmount * rate * 100) / 100;
  const netAmount =
    Math.round((grossAmount - serviceChargeAmount) * 100) / 100;

  return {
    grossAmount,
    serviceChargeRate: rate,
    serviceChargeAmount,
    netAmount,
  };
}

export function createVipWithdrawalRequest({
  userId,
  amount,
  tier = "vip",
  schedule,
  recipientName,
  recipientAccount,
  paymentMethod,
  currency = "UGX",
  now = new Date(),
  serviceChargeRate = DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE,
}: {
  userId: string;
  amount: number;
  tier?: WithdrawalTier;
  schedule: VipScheduleEntry[];
  recipientName?: string;
  recipientAccount?: string;
  paymentMethod?: string;
  currency?: string;
  now?: Date;
  serviceChargeRate?: number;
}) {
  const validation = isVipWithdrawalAllowed(schedule, now, tier);

  if (!validation.allowed) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      tier,
      reason: validation.rule,
      allowedDays: validation.allowedDays,
      allowedDayLabels: validation.labels,
    };
  }

  const date = getEastAfricaDateParts(now);

  if (tier === "vip" && date.day < 20) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      tier,
      reason: "VIP earnings cannot be withdrawn before the 20th of the month.",
      allowedDays: validation.allowedDays,
      allowedDayLabels: validation.labels,
    };
  }

  if (Number(amount) <= 0) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      tier,
      reason: "Withdrawal amount must be greater than zero.",
    };
  }

  if (!recipientName?.trim()) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      tier,
      reason: "Receiver name is required.",
    };
  }

  if (!recipientAccount?.trim()) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      tier,
      reason: "Phone number or card number is required.",
    };
  }

  if (!paymentMethod || !["AIRTEL_MONEY", "MOBILE_MONEY", "CARD"].includes(paymentMethod)) {
    return {
      ok: false,
      status: "REJECTED",
      userId,
      amount,
      tier,
      reason: "Select a valid withdrawal payment method.",
    };
  }

  const amounts = calculateWithdrawalAmounts(amount, serviceChargeRate);

  return {
    ok: true,
    status: "PENDING",
    userId,
    tier,
    amount: amounts.grossAmount,
    ...amounts,
    recipientName: recipientName.trim(),
    recipientAccount: recipientAccount.trim(),
    paymentMethod,
    currency,
    requestId: `withdrawal-${Date.now()}`,
    allowedDays: validation.allowedDays,
    allowedDayLabels: validation.labels,
    message: "Withdrawal request created and submitted to the manager for review.",
  };
}

export async function createPersistedVipWithdrawalRequest({
  userId,
  amount,
  tier,
  recipientName,
  recipientAccount,
  paymentMethod,
  currency = "UGX",
}: {
  userId: string;
  amount: number;
  tier?: WithdrawalTier;
  recipientName: string;
  recipientAccount: string;
  paymentMethod: string;
  currency?: string;
}) {
  const client = createServerSupabaseClient();

  if (!client) {
    const fallbackTier = tier ?? "vip";
    const result = createVipWithdrawalRequest({
      userId,
      amount,
      tier: fallbackTier,
      schedule: [
        { dayOfWeek: 1, isWithdrawalDay: true },
        { dayOfWeek: 3, isWithdrawalDay: true },
        { dayOfWeek: 5, isWithdrawalDay: true },
      ],
      recipientName,
      recipientAccount,
      paymentMethod,
      currency,
    });
    return { ...result, source: "memory" };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: "REJECTED", reason: profileError.message };
  }

  const resolvedTier = (profile?.tier ?? tier ?? "basic") as WithdrawalTier;
  if (!["basic", "premium", "vip"].includes(resolvedTier)) {
    return {
      ok: false,
      status: "REJECTED",
      reason: "A valid membership tier is required for withdrawals.",
    };
  }

  const { data: settingsRow } = await client
    .from("platform_settings")
    .select("settings")
    .eq("id", 1)
    .maybeSingle();

  const configuredRate = Number(
    settingsRow?.settings?.withdrawal?.serviceChargeRate ??
      DEFAULT_WITHDRAWAL_SERVICE_CHARGE_RATE,
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

  if (scheduleError) {
    return { ok: false, status: "REJECTED", reason: scheduleError.message };
  }

  const validation = createVipWithdrawalRequest({
    userId,
    amount,
    tier: resolvedTier,
    schedule: (scheduleRows ?? []).map((row) => ({
      dayOfWeek: row.day_of_week,
      isWithdrawalDay: row.is_withdrawal_day,
      isActive: row.is_active,
      cutoffTime: row.cutoff_time,
      processingWindow: row.processing_window,
    })),
    recipientName,
    recipientAccount,
    paymentMethod,
    currency,
    serviceChargeRate,
  });

  if (!validation.ok) return { ...validation, source: "supabase" };

  const { data: withdrawalData, error: withdrawalError } = await client.rpc(
    "request_cash_withdrawal_atomic",
    {
      p_user_id: userId,
      p_amount: amount,
      p_tier: resolvedTier,
      p_payment_method: paymentMethod,
      p_recipient_name: recipientName.trim(),
      p_recipient_account: recipientAccount.trim(),
      p_currency: currency,
      p_service_charge_rate: serviceChargeRate,
    },
  );

  if (withdrawalError || !withdrawalData) {
    return {
      ok: false,
      status: "REJECTED",
      reason:
        withdrawalError?.message ?? "Withdrawal request could not be saved.",
    };
  }

  const withdrawal = withdrawalData as {
    id: string;
    userId: string;
    tier: WithdrawalTier;
    paymentMethod: string;
    recipientName: string;
    recipientAccount: string;
    currency: string;
    grossAmount: number;
    serviceChargeRate: number;
    serviceChargeAmount: number;
    netAmount: number;
    status: string;
    createdAt: string;
  };
  return {
    ok: true,
    status: "PENDING",
    source: "supabase",
    requestId: withdrawal.id,
    userId: withdrawal.userId,
    tier: withdrawal.tier,
    paymentMethod: withdrawal.paymentMethod,
    recipientName: withdrawal.recipientName,
    recipientAccount: withdrawal.recipientAccount,
    currency: withdrawal.currency,
    amount: withdrawal.grossAmount,
    grossAmount: withdrawal.grossAmount,
    serviceChargeRate: withdrawal.serviceChargeRate,
    serviceChargeAmount: withdrawal.serviceChargeAmount,
    netAmount: withdrawal.netAmount,
    allowedDays: validation.allowedDays,
    allowedDayLabels: validation.allowedDayLabels,
    message: "Withdrawal request created, cash reserved, and submitted to the manager for review.",
  };
}
