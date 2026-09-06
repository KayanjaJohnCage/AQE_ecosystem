import { NextResponse } from 'next/server'
import { createSupportTicket } from '../../../lib/aqe/support'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const result = createSupportTicket({
      userId: String(body.userId ?? 'demo-user'),
      category: String(body.category ?? 'OTHER') as any,
      subject: String(body.subject ?? 'Support request'),
      message: String(body.message ?? 'No details provided'),
      priority: String(body.priority ?? 'MEDIUM') as any
    })

    return NextResponse.json(result)
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
