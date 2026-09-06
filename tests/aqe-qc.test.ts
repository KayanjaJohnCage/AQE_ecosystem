import { describe, expect, it } from 'vitest'
import { getDailyRewardForDay, DEFAULT_WEEKLY_REWARDS } from '../lib/aqe/dailyCheckin'
import { buildGatewaySuccessPayload, getGatewayMode } from '../lib/aqe/payments'

describe('AQE QC logic', () => {
  it('returns a configured daily QC reward for each weekday', () => {
    expect(getDailyRewardForDay(1)).toBe(0.2)
    expect(getDailyRewardForDay(2)).toBe(0.25)
    expect(getDailyRewardForDay(5)).toBe(0.4)
  })

  it('includes the default reward map for the weekly attendance schedule', () => {
    expect(DEFAULT_WEEKLY_REWARDS[0]).toBe(0)
    expect(DEFAULT_WEEKLY_REWARDS[6]).toBe(0.45)
  })
})

describe('AQE gateway flow', () => {
  it('uses mock mode when environment keys are missing', () => {
    expect(getGatewayMode({})).toBe('mock')
    expect(buildGatewaySuccessPayload({})).toMatchObject({ status: 'success', mode: 'mock' })
  })
})
