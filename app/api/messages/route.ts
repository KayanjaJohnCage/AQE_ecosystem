import { NextResponse } from 'next/server'
import { resolveMutationUserId } from '../../../lib/aqe/auth'
import { persistDirectMessage, validateCommunityText } from '../../../lib/aqe/community'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const identity = await resolveMutationUserId(request, typeof body.senderId === 'string' ? body.senderId : undefined)
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 })

    const recipientId = String(body.recipientId ?? '').trim()
    const text = validateCommunityText(body.body, 'Message')
    if (!recipientId || recipientId === identity.userId || !text.ok) {
      const reason = recipientId === identity.userId ? 'A message recipient must be different from the sender.' : recipientId ? text.reason : 'Recipient ID is required.'
      return NextResponse.json({ ok: false, reason }, { status: 400 })
    }

    const result = await persistDirectMessage({ senderId: identity.userId, recipientId, body: text.text })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : 'Message creation failed' }, { status: 400 })
  }
}