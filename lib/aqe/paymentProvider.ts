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

      if (env.NODE_ENV === "production" && mode === "mock") {
        throw new Error("Production payment configuration is incomplete: Supabase must be configured.");
      }

      return {
        ok: true,
        provider: "MukuruPay",
        mode,
        userId,
        amount,
        currency,
        qcPackageId,
        metadata,
        reference: `AQE-${Date.now()}`,
        redirectUrl:
          env.MUKURU_SEND_MONEY_URL ||
          env.NEXT_PUBLIC_MUKURU_SEND_MONEY_URL ||
          "https://www.mukuru.com/send-money/",
        status: "initiated" as const,
        message:
          mode === "mock"
            ? "Mukuru payment reference created. Complete payment on Mukuru, then wait for AQE confirmation."
            : "Mukuru payment reference created. Complete payment on Mukuru, then wait for AQE confirmation.",
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
