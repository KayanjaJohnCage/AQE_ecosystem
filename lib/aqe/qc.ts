import type { SupabaseClient } from '@supabase/supabase-js'

export type QcDirection = 'IN' | 'OUT'

export type QcTransactionType =
  | 'DAILY_CLAIM'
  | 'WEEKLY_CHECKIN'
  | 'ACHIEVEMENT'
  | 'TASK_REWARD'
  | 'CAMPAIGN_REWARD'
  | 'REFERRAL_REWARD'
  | 'GIFT_RECEIVED'
  | 'RAFFLE_REWARD'
  | 'PRIZE_REWARD'
  | 'PROMOTIONAL_BONUS'
  | 'ADMIN_GRANT'
  | 'QC_RECHARGE'
  | 'CONTENT_UNLOCK'
  | 'PROFILE_BOOST'
  | 'UPLOAD_ACCESS'
  | 'DOWNLOAD'
  | 'GIFT_SENT'
  | 'TIP_SENT'
  | 'DEVELOPER_APPRECIATION'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'

export type QcMutationInput = {
  userId: string
  amount: number
  direction: QcDirection
  transactionType: QcTransactionType
  description: string
  referenceType?: string
  referenceId?: string
  status?: 'PENDING' | 'COMPLETED' | 'FAILED'
  metadata?: Record<string, unknown>
}

export type QcWalletRow = {
  id: string
  user_id: string
  balance: number
  created_at: string
  updated_at: string
}

export const QC_TRANSACTION_TYPES: QcTransactionType[] = [
  'DAILY_CLAIM',
  'WEEKLY_CHECKIN',
  'ACHIEVEMENT',
  'TASK_REWARD',
  'CAMPAIGN_REWARD',
  'REFERRAL_REWARD',
  'GIFT_RECEIVED',
  'RAFFLE_REWARD',
  'PRIZE_REWARD',
  'PROMOTIONAL_BONUS',
  'ADMIN_GRANT',
  'QC_RECHARGE',
  'CONTENT_UNLOCK',
  'PROFILE_BOOST',
  'UPLOAD_ACCESS',
  'DOWNLOAD',
  'GIFT_SENT',
  'TIP_SENT',
  'DEVELOPER_APPRECIATION',
  'TRANSFER_OUT',
  'TRANSFER_IN'
]

export function normalizeQcAmount(amount: number): number {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('QC amount must be a positive number.')
  }

  return Number(value.toFixed(2))
}

export async function getQcBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('qc_wallet')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Number(data?.balance ?? 0)
}

export async function applyQcMutation(
  supabase: SupabaseClient,
  input: QcMutationInput
): Promise<{ balanceAfter: number; ledgerId: string | null }> {
  const normalizedAmount = normalizeQcAmount(input.amount)
  const currentBalance = await getQcBalance(supabase, input.userId)

  const balanceAfter =
    input.direction === 'IN'
      ? Number((currentBalance + normalizedAmount).toFixed(2))
      : Number((currentBalance - normalizedAmount).toFixed(2))

  if (balanceAfter < 0) {
    throw new Error('QC balance cannot go negative.')
  }

  const walletPayload = {
    user_id: input.userId,
    balance: balanceAfter,
    updated_at: new Date().toISOString()
  }

  const walletResult = await supabase
    .from('qc_wallet')
    .upsert(walletPayload, { onConflict: 'user_id' })
    .select('id, balance')
    .single()

  if (walletResult.error) {
    throw walletResult.error
  }

  const ledgerPayload = {
    user_id: input.userId,
    transaction_type: input.transactionType,
    amount: normalizedAmount,
    direction: input.direction,
    balance_after: balanceAfter,
    reference_type: input.referenceType ?? 'SYSTEM',
    reference_id: input.referenceId ?? null,
    description: input.description,
    status: input.status ?? 'COMPLETED',
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString()
  }

  const ledgerResult = await supabase
    .from('qc_ledger')
    .insert(ledgerPayload)
    .select('id')
    .single()

  if (ledgerResult.error) {
    throw ledgerResult.error
  }

  return {
    balanceAfter,
    ledgerId: ledgerResult.data?.id ?? null
  }
}
