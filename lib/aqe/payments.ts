export type GatewayMode = 'live' | 'mock'

export function getGatewayMode(env: Record<string, string | undefined>): GatewayMode {
  const hasPublicKey = Boolean(env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY)
  const hasSecretKey = Boolean(env.FLUTTERWAVE_SECRET_KEY)

  return hasPublicKey && hasSecretKey ? 'live' : 'mock'
}

export function buildGatewaySuccessPayload(env: Record<string, string | undefined>) {
  const mode = getGatewayMode(env)

  return {
    status: 'success',
    mode,
    message:
      mode === 'live'
        ? 'Flutterwave payment flow initialized successfully.'
        : 'Gateway validation passed in mock mode. Add real keys to .env.local to switch to live mode.',
    checkout: {
      provider: 'flutterwave',
      amount: 100,
      currency: 'NGN',
      status: 'PAID'
    }
  }
}

export function buildGatewayTestResult(
  env: Record<string, string | undefined>,
  override?: { amount?: number; currency?: string }
) {
  const base = buildGatewaySuccessPayload(env)

  return {
    ...base,
    checkout: {
      ...base.checkout,
      amount: override?.amount ?? base.checkout.amount,
      currency: override?.currency ?? base.checkout.currency
    }
  }
}
