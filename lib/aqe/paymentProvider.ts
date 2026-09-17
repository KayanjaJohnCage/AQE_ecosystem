import { createServerSupabaseClient } from "../supabaseServer";

export function createPaymentProvider(env: Record<string, string | undefined>) {
  return {
    createPaymentOrder: async ({
      userId,
      amount,
      currency,
      qcPackageId,
      metadata,
    }: {
      userId: string;
      amount: number;
      currency: string;
      qcPackageId: string;
      metadata?: Record<string, unknown>;
    }) => {
      const mode =
        env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          ? "live"
          : "mock";

      return {
        ok: true,
        provider: "aqe-payment-provider",
        mode,
        userId,
        amount,
        currency,
        qcPackageId,
        metadata,
        reference: `AQE-${Date.now()}`,
        message:
          mode === "mock"
            ? "Mock payment initialization (configure provider keys to enable live flow)."
            : "Payment provider initialized.",
      };
    },
  };
}

export async function persistPaymentOrder(order: {
  userId: string;
  amount: number;
  currency: string;
  qcPackageId: string;
  reference: string;
  provider: string;
  mode: string;
  metadata?: Record<string, unknown>;
}) {
  const client = createServerSupabaseClient();

  if (!client) {
    return { ok: true, saved: false, source: "memory", order };
  }

  const { data, error } = await client
    .from("payment_orders")
    .insert({
      user_id: order.userId,
      amount: order.amount,
      currency: order.currency,
      qc_package_id: order.qcPackageId,
      reference: order.reference,
      provider: order.provider,
      mode: order.mode,
      status: "initiated",
      metadata: order.metadata ?? {},
    })
    .select(
      "id, user_id, amount, currency, qc_package_id, reference, provider, mode, status",
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      saved: false,
      source: "supabase",
      reason: error?.message ?? "Payment order could not be saved.",
    };
  }

  return { ok: true, saved: true, source: "supabase", order: data };
}
