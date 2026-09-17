import { NextResponse } from 'next/server'
import { resolveMutationUserId } from '../../../../lib/aqe/auth'
import { persistSupportTicket } from '../../../../lib/aqe/support'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const identity = await resolveMutationUserId(request, typeof body.userId === 'string' ? body.userId : undefined)

    if (!identity.ok) {
      return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 })
    }

    const result = await persistSupportTicket({
      userId: identity.userId,
      category: String(body.category ?? 'OTHER') as any,
      subject: String(body.subject ?? 'Support request'),
      message: String(body.message ?? 'No details provided'),
      priority: String(body.priority ?? 'MEDIUM') as any
    })

    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Support ticket creation failed'
      },
      { status: 400 }
    )
  }
}
