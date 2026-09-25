import { describe, expect, it } from "vitest";
import {
  MAX_WITHDRAWAL_AMOUNT,
  MIN_WITHDRAWAL_AMOUNT,
  calculateWithdrawalAmounts,
  createVipWithdrawalRequest,
  getWithdrawalCooldownHours,
  getWithdrawalPolicy,
} from "../lib/aqe/vip";

const schedule = [
  { dayOfWeek: 1, isWithdrawalDay: true },
  { dayOfWeek: 3, isWithdrawalDay: true },
  { dayOfWeek: 5, isWithdrawalDay: true },
];

describe("CEO withdrawal policy", () => {
  it("uses the published tier frequencies", () => {
    expect(getWithdrawalPolicy("basic").allowedDays).toEqual([0, 6]);
    expect(getWithdrawalPolicy("premium").allowedDays).toHaveLength(7);
    expect(getWithdrawalPolicy("vip").allowedDays).toHaveLength(7);
    expect(getWithdrawalCooldownHours("basic")).toBe(24);
    expect(getWithdrawalCooldownHours("premium")).toBe(48);
    expect(getWithdrawalCooldownHours("vip")).toBe(24);
  });

  it("calculates the 10% service charge", () => {
    expect(calculateWithdrawalAmounts(5_000_000)).toEqual({
      grossAmount: 5_000_000,
      serviceChargeRate: 0.10,
      serviceChargeAmount: 500_000,
      netAmount: 4_500_000,
    });
  });

  it("enforces the minimum and maximum withdrawal amounts", () => {
    const belowMinimum = createVipWithdrawalRequest({
      userId: "u-123",
      amount: MIN_WITHDRAWAL_AMOUNT - 1,
      tier: "vip",
      schedule,
      recipientName: "Test User",
      recipientAccount: "0700000000",
      paymentMethod: "AIRTEL_MONEY",
      now: new Date("2026-09-23T12:00:00Z"),
    });
    expect(belowMinimum.ok).toBe(false);
    expect(belowMinimum.reason).toContain("30,000");

    const aboveMaximum = createVipWithdrawalRequest({
      userId: "u-123",
      amount: MAX_WITHDRAWAL_AMOUNT + 1,
      tier: "vip",
      schedule,
      recipientName: "Test User",
      recipientAccount: "0700000000",
      paymentMethod: "AIRTEL_MONEY",
      now: new Date("2026-09-23T12:00:00Z"),
    });
    expect(aboveMaximum.ok).toBe(false);
    expect(aboveMaximum.reason).toContain("5,000,000");
  });

  it("allows Basic on a weekend", () => {
    const result = createVipWithdrawalRequest({
      userId: "u-123",
      amount: 30_000,
      tier: "basic",
      schedule,
      recipientName: "Test User",
      recipientAccount: "0700000000",
      paymentMethod: "AIRTEL_MONEY",
      now: new Date("2026-09-26T12:00:00Z"),
    });
    expect(result.ok).toBe(true);
  });

  it("blocks Basic on a weekday", () => {
    const result = createVipWithdrawalRequest({
      userId: "u-123",
      amount: 30_000,
      tier: "basic",
      schedule,
      recipientName: "Test User",
      recipientAccount: "0700000000",
      paymentMethod: "AIRTEL_MONEY",
      now: new Date("2026-09-28T12:00:00Z"),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("weekends");
  });

  it("enforces Premium's 48-hour interval", () => {
    const result = createVipWithdrawalRequest({
      userId: "u-123",
      amount: 30_000,
      tier: "premium",
      schedule,
      recipientName: "Test User",
      recipientAccount: "0700000000",
      paymentMethod: "AIRTEL_MONEY",
      now: new Date("2026-09-28T12:00:00Z"),
      lastWithdrawalAt: new Date("2026-09-27T12:00:00Z"),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("frequency");
  });

  it("enforces VIP's 24-hour interval", () => {
    const result = createVipWithdrawalRequest({
      userId: "u-123",
      amount: 30_000,
      tier: "vip",
      schedule,
      recipientName: "Test User",
      recipientAccount: "0700000000",
      paymentMethod: "AIRTEL_MONEY",
      now: new Date("2026-09-23T12:00:00Z"),
      lastWithdrawalAt: new Date("2026-09-23T00:01:00Z"),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("frequency");
  });

  it("does not impose the Asset Room salary's day-20 rule on cash withdrawals", () => {
    const result = createVipWithdrawalRequest({
      userId: "u-123",
      amount: 30_000,
      tier: "vip",
      schedule,
      recipientName: "Test User",
      recipientAccount: "0700000000",
      paymentMethod: "AIRTEL_MONEY",
      now: new Date("2026-09-10T12:00:00Z"),
    });
    expect(result.ok).toBe(true);
  });
});
