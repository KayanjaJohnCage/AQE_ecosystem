import { NextResponse } from 'next/server'
import { resolveMutationUserId } from '../../../../lib/aqe/auth'
import { getVipFeatureAccess } from '../../../../lib/aqe/featureFlags'
import { createServerSupabaseClient } from '../../../../lib/supabaseServer'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const feature = String(body.feature ?? 'invites')
    const validFeatures = ['invites', 'my_team', 'rewards', 'raffle', 'asset_room', 'store']

    if (!validFeatures.includes(feature)) {
      return NextResponse.json({ ok: false, reason: 'Unsupported VIP feature.' }, { status: 400 })
    }

    const identity = await resolveMutationUserId(request, typeof body.userId === 'string' ? body.userId : undefined)

    if (!identity.ok) {
      return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 })
    }

    let tier = 'basic'
    const client = createServerSupabaseClient()

    if (client) {
      const { data: profile } = await client.from('profiles').select('tier').eq('user_id', identity.userId).maybeSingle()
      tier = profile?.tier ?? 'basic'
    } else if (body.tier === 'premium' || body.tier === 'vip') {
      tier = body.tier
    }

    const access = getVipFeatureAccess(feature as any, tier as 'basic' | 'premium' | 'vip')

    return NextResponse.json({
      ok: true,
      feature,
      tier,
      allowed: access.allowed,
      reason: access.reason
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : 'VIP feature check failed'
      },
      { status: 400 }
    )
  }
}
