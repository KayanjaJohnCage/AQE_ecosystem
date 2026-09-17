import { NextResponse } from 'next/server'

export async function GET() {
  const hasPublicSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const hasServerSupabase = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  return NextResponse.json({
    ok: true,
    app: 'aqe-ecosystem',
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
    supabase: {
      publicConfigured: hasPublicSupabase,
      serverConfigured: hasServerSupabase,
      productionReady: hasPublicSupabase && hasServerSupabase
    },
    timestamp: new Date().toISOString()
  })
}
