export type PaymentState = 'initiated' | 'pending' | 'confirmed' | 'rejected' | 'cancelled'

export type WalletMutationResult = {
  ok: boolean
  balanceAfter: number
  status: PaymentState | 'completed' | 'failed'
  reason?: string
}

export function createWalletMutation({
  currentBalance,
  delta,
  kind
}: {
  currentBalance: number
  delta: number
  kind: 'credit' | 'debit'
}): WalletMutationResult {
  const amount = Number(delta)

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      balanceAfter: currentBalance,
      status: 'failed',
      reason: 'Amount must be greater than zero.'
    }
  }

  if (kind === 'debit' && currentBalance < amount) {
    return {
      ok: false,
      balanceAfter: currentBalance,
      status: 'failed',
      reason: 'Insufficient wallet balance.'
    }
  }

  return {
    ok: true,
    balanceAfter: kind === 'credit' ? currentBalance + amount : currentBalance - amount,
    status: 'completed'
  }
}

export function createQcLedgerMutation({
  currentBalance,
  delta,
  kind
}: {
  currentBalance: number
  delta: number
  kind: 'credit' | 'debit'
}): WalletMutationResult {
  return createWalletMutation({ currentBalance, delta, kind })
}

export function createPaymentStateTransition({
  currentState,
  nextState
}: {
  currentState: PaymentState
  nextState: PaymentState
}) {
  const allowed: Record<PaymentState, PaymentState[]> = {
    initiated: ['pending', 'cancelled'],
    pending: ['confirmed', 'rejected', 'cancelled'],
    confirmed: [],
    rejected: [],
    cancelled: []
  }

  if (currentState === nextState) return { ok: true }
  if (!allowed[currentState]?.includes(nextState)) {
    return { ok: false, reason: `State transition ${currentState} -> ${nextState} is not allowed.` }
  }

  return { ok: true }
}
