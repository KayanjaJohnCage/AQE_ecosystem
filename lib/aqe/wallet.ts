export type WalletLedgerDirection = "credit" | "debit";

export type WalletLedgerEntry = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  direction: WalletLedgerDirection;
  referenceType: string;
  referenceId: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  balanceAfter: number;
};

export function applyWalletLedger({
  userId,
  amount,
  currency = "USD",
  direction,
  referenceType,
  referenceId,
  currentBalance = 0,
  status = "completed",
}: {
  userId: string;
  amount: number;
  currency?: string;
  direction: WalletLedgerDirection;
  referenceType: string;
  referenceId: string;
  currentBalance?: number;
  status?: "pending" | "completed" | "failed";
}): {
  ok: boolean;
  balanceAfter: number;
  ledgerEntry: WalletLedgerEntry;
  reason?: string;
} {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      ok: false,
      balanceAfter: currentBalance,
      ledgerEntry: {
        id: `wallet-${Date.now()}`,
        userId,
        amount: 0,
        currency,
        direction,
        referenceType,
        referenceId,
        status,
        createdAt: new Date().toISOString(),
        balanceAfter: currentBalance,
      },
      reason: "Amount must be greater than zero.",
    };
  }

  if (direction === "debit" && currentBalance < numericAmount) {
    return {
      ok: false,
      balanceAfter: currentBalance,
      ledgerEntry: {
        id: `wallet-${Date.now()}`,
        userId,
        amount: numericAmount,
        currency,
        direction,
        referenceType,
        referenceId,
        status: "failed",
        createdAt: new Date().toISOString(),
        balanceAfter: currentBalance,
      },
      reason: "Insufficient wallet balance.",
    };
  }

  const balanceAfter =
    direction === "credit"
      ? currentBalance + numericAmount
      : currentBalance - numericAmount;

  return {
    ok: true,
    balanceAfter,
    ledgerEntry: {
      id: `wallet-${Date.now()}`,
      userId,
      amount: numericAmount,
      currency,
      direction,
      referenceType,
      referenceId,
      status,
      createdAt: new Date().toISOString(),
      balanceAfter,
    },
  };
}
