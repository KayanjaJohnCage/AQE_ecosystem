import { createServerSupabaseClient } from '../supabaseServer'

export function validateCommunityText(value: unknown, field: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { ok: false as const, reason: `${field} is required.` }
  if (text.length > 2000) return { ok: false as const, reason: `${field} is too long.` }
  return { ok: true as const, text }
}

export async function persistProfileComment({ authorId, profileId, body }: { authorId: string; profileId: string; body: string }) {
  const client = createServerSupabaseClient()

  if (!client) {
    return { ok: true, saved: false, source: 'memory', comment: { authorId, profileId, body } }
  }

  const { data, error } = await client
    .from('profile_comments')
    .insert({ author_id: authorId, profile_id: profileId, body })
    .select('id, author_id, profile_id, body, created_at')
    .single()

  if (error || !data) {
    return { ok: false, saved: false, source: 'supabase', reason: error?.message ?? 'Comment could not be saved.' }
  }

  return { ok: true, saved: true, source: 'supabase', comment: data }
}

export async function persistDirectMessage({ senderId, recipientId, body }: { senderId: string; recipientId: string; body: string }) {
  const client = createServerSupabaseClient()

  if (!client) {
    return { ok: true, saved: false, source: 'memory', message: { senderId, recipientId, body } }
  }

  const { data, error } = await client
    .from('direct_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, body })
    .select('id, sender_id, recipient_id, body, created_at')
    .single()

  if (error || !data) {
    return { ok: false, saved: false, source: 'supabase', reason: error?.message ?? 'Message could not be saved.' }
  }

  return { ok: true, saved: true, source: 'supabase', message: data }
}