import { NextResponse } from 'next/server'
import { createPaymentProvider } from '../../../lib/aqe/paymentProvider'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const provider = createPaymentProvider(process.env)

    const order = await provider.createPaymentOrder({
      userId: String(body.userId ?? 'demo-user'),
      amount: Number(body.amount ?? 100),
      currency: String(body.currency ?? 'NGN'),
      qcPackageId: String(body.qcPackageId ?? 'default'),
      metadata: {
        source: 'aqe-payment-init',
        origin: 'server'
      }
    })

    return NextResponse.json({
      ok: true,
      provider: order.provider,
      mode: order.message?.includes('Mock') ? 'mock' : 'configured',
      ...order
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Gateway initialization failed'
      },
      { status: 400 }
    )
  }
}
