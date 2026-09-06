import { NextResponse } from 'next/server'
import { createVipWithdrawalRequest } from '../../../lib/aqe/vip'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))

    const result = createVipWithdrawalRequest({
      userId: String(body.userId ?? 'demo-vip-user'),
      amount: Number(body.amount ?? 0),
      schedule: Array.isArray(body.schedule)
        ? body.schedule.map((entry: any) => ({
            dayOfWeek: Number(entry.dayOfWeek),
            isWithdrawalDay: Boolean(entry.isWithdrawalDay),
            isActive: entry.isActive ?? true,
            cutoffTime: entry.cutoffTime ?? '18:00',
            processingWindow: entry.processingWindow ?? '2 business days'
          }))
        : [
            { dayOfWeek: 1, isWithdrawalDay: true },
            { dayOfWeek: 3, isWithdrawalDay: true },
            { dayOfWeek: 5, isWithdrawalDay: true }
          ],
      now: body.now ? new Date(body.now) : new Date()
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'VIP withdrawal failed'
      },
      { status: 400 }
    )
  }
}
