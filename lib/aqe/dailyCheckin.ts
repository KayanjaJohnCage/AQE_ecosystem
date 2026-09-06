import { applyQcMutation } from './qc'
import type { SupabaseClient } from '@supabase/supabase-js'

export type WeeklyRewardMap = Record<number, number>

export const DEFAULT_WEEKLY_REWARDS: WeeklyRewardMap = {
  0: 0,
  1: 0.2,
  2: 0.25,
  3: 0.3,
  4: 0.35,
  5: 0.4,
  6: 0.45
}

export function getDailyRewardForDay(dayOfWeek: number, rewards: WeeklyRewardMap = DEFAULT_WEEKLY_REWARDS): number {
  const resolved = Number(rewards[dayOfWeek] ?? 0)
  return Number.isFinite(resolved) ? Number(resolved.toFixed(2)) : 0
}

export function getTodayIsoDate(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export async function claimDailyReward(
  supabase: SupabaseClient,
  userId: string,
  date = new Date()
): Promise<{ ok: boolean; amount: number; balanceAfter?: number; reason?: string }> {
  const isoDate = getTodayIsoDate(date)

  const existing = await supabase
    .from('daily_checkin')
    .select('id, qc_reward')
    .eq('user_id', userId)
    .eq('date', isoDate)
    .maybeSingle()

  if (existing.error) {
    throw existing.error
  }

  if (existing.data) {
    return {
      ok: false,
      amount: Number(existing.data.qc_reward ?? 0),
      reason: 'Daily QC has already been claimed for this date.'
    }
  }

  const dayOfWeek = new Date(`${isoDate}T00:00:00`).getDay()
  const reward = getDailyRewardForDay(dayOfWeek)

  const mutation = await applyQcMutation(supabase, {
    userId,
    amount: reward,
    direction: 'IN',
    transactionType: 'DAILY_CLAIM',
    description: `Daily QC claim for ${isoDate}`,
    referenceType: 'DAILY_CLAIM',
    referenceId: isoDate,
    metadata: { date: isoDate, day_of_week: dayOfWeek }
  })

  const insert = await supabase.from('daily_checkin').insert({
    user_id: userId,
    date: isoDate,
    claimed: true,
    qc_reward: reward,
    created_at: new Date().toISOString()
  })

  if (insert.error) {
    throw insert.error
  }

  return {
    ok: true,
    amount: reward,
    balanceAfter: mutation.balanceAfter
  }
}

export async function getWeeklyAttendanceStatus(
  supabase: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<Array<{ day: number; label: string; reward: number; claimed: boolean }>> {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const startDay = start.getDay()
  const startDate = new Date(start)
  startDate.setDate(start.getDate() - startDay)

  const dates: string[] = []
  for (let i = 0; i < 7; i += 1) {
    const current = new Date(startDate)
    current.setDate(startDate.getDate() + i)
    dates.push(getTodayIsoDate(current))
  }

  const { data, error } = await supabase
    .from('daily_checkin')
    .select('date, qc_reward')
    .eq('user_id', userId)
    .in('date', dates)

  if (error) {
    throw error
  }

  const claimed = new Set((data ?? []).map((row) => row.date))

  return Object.entries(DEFAULT_WEEKLY_REWARDS).map(([day, reward]) => ({
    day: Number(day),
    label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(day)],
    reward: Number(reward),
    claimed: claimed.has(dates[Number(day)])
  }))
}
