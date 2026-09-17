import { createServerSupabaseClient } from '../supabaseServer'

export type AuditAction =
  | 'user_update'
  | 'tier_change'
  | 'verification_decision'
  | 'payment_approval'
  | 'wallet_credit'
  | 'wallet_debit'
  | 'withdrawal_decision'
  | 'media_removal'
  | 'moderation'
  | 'feature_flag_change'
  | 'reward_grant'
  | 'campaign_change'

export function createAuditEntry({
  actorId,
  action,
  targetType,
  targetId,
  details,
  metadata = {}
}: {
  actorId?: string
  action: AuditAction
  targetType?: string
  targetId?: string
  details?: string
  metadata?: Record<string, unknown>
}) {
  return {
    ok: true,
    auditId: `audit-${Date.now()}`,
    actorId,
    action,
    targetType,
    targetId,
    details,
    metadata,
    createdAt: new Date().toISOString()
  }
}

export async function persistAuditEntry(entry: ReturnType<typeof createAuditEntry>) {
  const client = createServerSupabaseClient()

  if (!client) return { ok: true, saved: false, source: 'memory', audit: entry }

  const { data, error } = await client
    .from('audit_log')
    .insert({
      actor_id: entry.actorId ?? null,
      action: entry.action,
      entity_type: entry.targetType ?? null,
      entity_id: entry.targetId ?? null,
      reason: entry.details ?? null,
      metadata: entry.metadata
    })
    .select('id, actor_id, action, entity_type, entity_id, reason, metadata, created_at')
    .single()

  if (error || !data) {
    return { ok: false, saved: false, source: 'supabase', reason: error?.message ?? 'Audit entry could not be saved.' }
  }

  return { ok: true, saved: true, source: 'supabase', audit: data }
}
