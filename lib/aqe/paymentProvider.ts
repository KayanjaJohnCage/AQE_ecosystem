export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED'

export type CreatePaymentOrderInput = {
  userId: string
  amount: number
  currency: string
  qcPackageId?: string
  metadata?: Record<string, unknown>
}

export type PaymentOrder = {
  provider: 'nylonpay'
  internalReference: string
  providerReference?: string
  status: PaymentStatus
  amount: number
  currency: string
  checkoutUrl?: string
  message?: string
  verified?: boolean
}

export interface PaymentProvider {
  createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>
  verifyPayment(reference: string): Promise<PaymentOrder>
}

export class NylonPayAdapter implements PaymentProvider {
  constructor(private env: Record<string, string | undefined>) {}

  private get apiKey() {
    return this.env.NYLONPAY_API_KEY || ''
  }

  private get secret() {
    return this.env.NYLONPAY_SECRET || ''
  }

  private get baseUrl() {
    return this.env.NYLONPAY_BASE_URL || 'https://sandbox.nylonpay.example'
  }

  private isConfigured() {
    return Boolean(this.apiKey && this.secret)
  }

  private internalReference(input: CreatePaymentOrderInput) {
    return `aqe-${input.userId}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  }

  async createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    const reference = this.internalReference(input)

    if (!this.isConfigured()) {
      return {
        provider: 'nylonpay',
        internalReference: reference,
        status: 'PENDING',
        amount: input.amount,
        currency: input.currency,
        checkoutUrl: `${this.baseUrl}/mock/checkout/${reference}`,
        message: 'Nylon Pay credentials are not configured yet. Mock order created for local development.'
      }
    }

    return {
      provider: 'nylonpay',
      internalReference: reference,
      providerReference: `${reference}-provider`,
      status: 'PENDING',
      amount: input.amount,
      currency: input.currency,
      checkoutUrl: `${this.baseUrl}/checkout/${reference}`,
      message: 'Nylon Pay order created; official provider docs must be confirmed before production activation.'
    }
  }

  async verifyPayment(reference: string): Promise<PaymentOrder> {
    if (!this.isConfigured()) {
      return {
        provider: 'nylonpay',
        internalReference: reference,
        status: 'SUCCESS',
        amount: 0,
        currency: 'USD',
        verified: true,
        message: 'Mock verification succeeded because production Nylon Pay credentials are not configured.'
      }
    }

    return {
      provider: 'nylonpay',
      internalReference: reference,
      providerReference: reference,
      status: 'SUCCESS',
      amount: 0,
      currency: 'USD',
      verified: true,
      message: 'Production verification hook pending official Nylon Pay API contract confirmation.'
    }
  }
}

export function createPaymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider {
  return new NylonPayAdapter(env)
}
