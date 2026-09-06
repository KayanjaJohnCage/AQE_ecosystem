import { NextResponse } from 'next/server'
import { claimDailyReward } from '../../../lib/aqe/dailyCheckin'
import { getSupabaseClient } from '../../../lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const userId = String(body.userId ?? 'demo-user')
    const supabase = getSupabaseClient()

    if (!supabase) {
      return NextResponse.json({
        ok: true,
        amount: 5,
        balanceAfter: 5,
        mode: 'demo',
        message: 'Demo mode: daily QC claim succeeded without a connected Supabase project.'
      })
    }

    const result = await claimDailyReward(supabase, userId)
    return NextResponse.json({
      ...result,
      mode: 'supabase'
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : 'Unknown daily claim error'
      },
      { status: 400 }
    )
  }
}
