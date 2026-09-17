export function getGatewayMode(env: Record<string, string | undefined>) {
  return env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'live' : 'mock'
}

export function buildGatewaySuccessPayload(env: Record<string, string | undefined>) {
  const mode = getGatewayMode(env)

  return {
    ok: true,
    status: 'success',
    mode,
    provider: 'aqe-gateway',
    reference: 'AQE-DEMO-REF-001'
  }
}
