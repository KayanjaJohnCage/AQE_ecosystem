import { createServerSupabaseClient } from '../supabaseServer'

export type SubscriptionTier = 'basic' | 'premium' | 'vip'

export type SubscriptionRecord = {
  id: string
  userId: string
  tier: SubscriptionTier
  status: 'active' | 'cancelled' | 'expired' | 'pending'
  startedAt: string
  expiresAt?: string
  amount: number
  currency: string
}

export function createSubscription({
  userId,
  tier,
  amount,
  currency = 'USD'
}: {
  userId: string
  tier: SubscriptionTier
  amount: number
  currency?: string
}) {
  if (!userId) {
    return { ok: false, reason: 'User ID is required.' }
  }

  if (!['basic', 'premium', 'vip'].includes(tier)) {
    return { ok: false, reason: 'Unsupported subscription tier.' }
  }

  const now = new Date().toISOString()

  return {
    ok: true,
    subscription: {
      id: `subscription-${Date.now()}`,
      userId,
      tier,
      status: 'active',
      startedAt: now,
      amount,
      currency
    } as SubscriptionRecord
  }
}

export async function persistSubscription(subscription: SubscriptionRecord) {
  const client = createServerSupabaseClient()

  if (!client) {
    return { ok: true, saved: false, source: 'memory', subscription }
  }

  const { data, error } = await client
    .from('subscriptions')
    .insert({
      user_id: subscription.userId,
      tier: subscription.tier,
      status: subscription.status,
      started_at: subscription.startedAt,
      expires_at: subscription.expiresAt ?? null,
      amount: subscription.amount,
      currency: subscription.currency
    })
    .select('id, user_id, tier, status, started_at, expires_at, amount, currency')
    .single()

  if (error || !data) {
    return { ok: false, saved: false, source: 'supabase', reason: error?.message ?? 'Subscription could not be saved.' }
  }

  return { ok: true, saved: true, source: 'supabase', subscription: data }
}
