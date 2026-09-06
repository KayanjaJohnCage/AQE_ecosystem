export type VipWithdrawalStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED'
  | 'CANCELLED'

export type VipScheduleConfig = {
  dayOfWeek: number
  isWithdrawalDay: boolean
  cutoffTime?: string
  processingWindow?: string
  isActive?: boolean
}

export function normalizeVipSchedule(schedule: VipScheduleConfig[]): VipScheduleConfig[] {
  const valid = schedule.filter((entry) => Number.isInteger(entry.dayOfWeek) && entry.dayOfWeek >= 0 && entry.dayOfWeek <= 6)
  return valid.filter((entry) => entry.isActive !== false).map((entry) => ({
    ...entry,
    isWithdrawalDay: Boolean(entry.isWithdrawalDay),
    isActive: entry.isActive ?? true,
    cutoffTime: entry.cutoffTime ?? '18:00',
    processingWindow: entry.processingWindow ?? '2 business days'
  }))
}

export function getConfiguredVipWithdrawalDays(schedule: VipScheduleConfig[]): number[] {
  return normalizeVipSchedule(schedule)
    .filter((entry) => entry.isWithdrawalDay)
    .map((entry) => entry.dayOfWeek)
}

export function isVipWithdrawalAllowed(schedule: VipScheduleConfig[], now = new Date()): { allowed: boolean; nextDay?: number; reason?: string } {
  const normalized = normalizeVipSchedule(schedule)
  const allowedDays = getConfiguredVipWithdrawalDays(normalized)
  const today = now.getDay()

  if (allowedDays.includes(today)) {
    return { allowed: true }
  }

  const upcoming = allowedDays.find((day) => day > today) ?? allowedDays.find((day) => day <= today)
  const nextDay = upcoming ?? allowedDays[0]

  if (nextDay === undefined) {
    return { allowed: false, reason: 'No configured VIP withdrawal days are active.' }
  }

  return {
    allowed: false,
    nextDay,
    reason: 'VIP withdrawals are available only on the configured three-day weekly schedule.'
  }
}

export function createVipWithdrawalRequest(input: {
  userId: string
  amount: number
  schedule: VipScheduleConfig[]
  now?: Date
}): { ok: boolean; status: VipWithdrawalStatus; reason?: string; nextDay?: number } {
  const { allowed, nextDay, reason } = isVipWithdrawalAllowed(input.schedule, input.now ?? new Date())

  if (!allowed) {
    return {
      ok: false,
      status: 'REJECTED',
      reason: reason ?? 'Withdrawal not available today.',
      nextDay
    }
  }

  return {
    ok: true,
    status: 'PENDING',
    reason: `VIP withdrawal approved for ${input.userId}`
  }
}
