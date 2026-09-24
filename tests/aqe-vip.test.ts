import { describe, expect, it } from "vitest";
import {
  createVipWithdrawalRequest,
  getConfiguredVipWithdrawalDays,
  isVipWithdrawalAllowed,
} from "../lib/aqe/vip";

describe("VIP withdraw schedule", () => {
  it("returns the configured withdrawal days", () => {
    const schedule = [
      { dayOfWeek: 1, isWithdrawalDay: true },
      { dayOfWeek: 3, isWithdrawalDay: true },
      { dayOfWeek: 5, isWithdrawalDay: true },
    ];

    expect(getConfiguredVipWithdrawalDays(schedule)).toEqual([1, 3, 5]);
  });

  it("allows withdrawals only on configured days", () => {
    const schedule = [
      { dayOfWeek: 1, isWithdrawalDay: true },
      { dayOfWeek: 3, isWithdrawalDay: true },
      { dayOfWeek: 5, isWithdrawalDay: true },
    ];

    expect(
      isVipWithdrawalAllowed(schedule, new Date("2026-09-08T12:00:00Z"))
        .allowed,
    ).toBe(false);
    expect(
      isVipWithdrawalAllowed(schedule, new Date("2026-09-23T12:00:00Z"))
        .allowed,
    ).toBe(true);
  });

  it("creates a pending request when the current day is eligible", () => {
    const result = createVipWithdrawalRequest({
      userId: "u-123",
      amount: 500,
      schedule: [
        { dayOfWeek: 1, isWithdrawalDay: true },
        { dayOfWeek: 3, isWithdrawalDay: true },
        { dayOfWeek: 5, isWithdrawalDay: true },
      ],
      now: new Date("2026-09-23T12:00:00Z"),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PENDING");
  });
});
