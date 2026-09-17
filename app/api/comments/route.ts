import { NextResponse } from 'next/server'
import { resolveMutationUserId } from '../../../lib/aqe/auth'
import { persistProfileComment, validateCommunityText } from '../../../lib/aqe/community'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const identity = await resolveMutationUserId(request, typeof body.authorId === 'string' ? body.authorId : undefined)
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 })

    const profileId = String(body.profileId ?? '').trim()
    const text = validateCommunityText(body.body, 'Comment')
    if (!profileId || !text.ok) {
      return NextResponse.json({ ok: false, reason: profileId ? text.reason : 'Profile ID is required.' }, { status: 400 })
    }

    const result = await persistProfileComment({ authorId: identity.userId, profileId, body: text.text })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : 'Comment creation failed' }, { status: 400 })
  }
}