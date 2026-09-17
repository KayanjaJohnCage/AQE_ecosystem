export const DAILY_CHAT_ALLOWANCE_QC = 5

import { createServerSupabaseClient } from '../supabaseServer'

export type ChatChargeResult = {
  ok: boolean
  charged: number
  remainingDailyAllowance: number
  remainingGlobalBalance: number
  status: 'sent' | 'rejected'
  reason?: string
}

export function calculateQcChatCharge({
  tier,
  dailyUsed,
  globalBalance,
  messageCount = 1
}: {
  tier: 'basic' | 'premium' | 'vip'
  dailyUsed: number
  globalBalance: number
  messageCount?: number
}): ChatChargeResult {
  const allowanceAvailable = tier === 'basic' ? 0 : DAILY_CHAT_ALLOWANCE_QC
  const freeRemaining = Math.max(0, allowanceAvailable - dailyUsed)
  const totalRequired = messageCount

  if (freeRemaining >= totalRequired) {
    return {
      ok: true,
      charged: 0,
      remainingDailyAllowance: freeRemaining - totalRequired,
      remainingGlobalBalance: Math.max(0, globalBalance),
      status: 'sent'
    }
  }

  const chargeFromGlobal = totalRequired - Math.max(0, freeRemaining)

  if (globalBalance < chargeFromGlobal) {
    return {
      ok: false,
      charged: 0,
      remainingDailyAllowance: 0,
      remainingGlobalBalance: globalBalance,
      status: 'rejected',
      reason: 'Insufficient QC balance. Please recharge before sending chat messages.'
    }
  }

  return {
    ok: true,
    charged: chargeFromGlobal,
    remainingDailyAllowance: 0,
    remainingGlobalBalance: globalBalance - chargeFromGlobal,
    status: 'sent'
  }
}

export async function chargeChatQcServer({
  tier,
  dailyUsed,
  globalBalance,
  messageCount = 1,
  ledger = [] as { id: string; amount: number; type: string }[]
}: {
  tier: 'basic' | 'premium' | 'vip'
  dailyUsed: number
  globalBalance: number
  messageCount?: number
  ledger?: { id: string; amount: number; type: string }[]
}): Promise<ChatChargeResult & { ledger: typeof ledger }> {
  const result = calculateQcChatCharge({ tier, dailyUsed, globalBalance, messageCount })

  if (!result.ok) {
    return { ...result, ledger }
  }

  const nextLedger = [
    ...ledger,
    {
      id: `qc-chat-${Date.now()}`,
      amount: result.charged,
      type: 'chat_message'
    }
  ]

  return {
    ...result,
    ledger: nextLedger
  }
}

export async function chargeChatQcFromDatabase(userId: string, messageCount = 1) {
  const client = createServerSupabaseClient()

  if (!client) {
    return { ok: false as const, reason: 'Supabase is not configured.' }
  }

  const { data, error } = await client.rpc('charge_chat_qc', {
    p_user_id: userId,
    p_message_count: messageCount
  })

  if (error) {
    return { ok: false as const, reason: error.message }
  }

  return data as {
    ok: boolean
    charged?: number
    remainingDailyAllowance?: number
    remainingGlobalBalance?: number
    ledgerId?: string
    reason?: string
  }
}
