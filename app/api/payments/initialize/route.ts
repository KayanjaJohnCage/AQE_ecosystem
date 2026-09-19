import { NextResponse } from "next/server";
import { normalizeTier, resolveMutationUserId } from "../../../../lib/aqe/auth";
import {
  createPaymentProvider,
  persistPaymentOrder,
} from "../../../../lib/aqe/paymentProvider";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(
      request,
      typeof body.userId === "string" ? body.userId : undefined,
    );

    if (!identity.ok) {
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );
    }

    const amount = Number(body.amount ?? 0);
    const currency = String(body.currency ?? "NGN")
      .trim()
      .toUpperCase();
    const qcPackageId = String(body.qcPackageId ?? "default").trim();
    const requestedTier = normalizeTier(
      typeof body.tier === "string" ? body.tier : "basic",
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, reason: "Payment amount must be greater than zero." },
        { status: 400 },
      );
    }

    if (!/^[A-Z]{3}$/.test(currency) || !qcPackageId) {
      return NextResponse.json(
        { ok: false, reason: "A valid currency and QC package are required." },
        { status: 400 },
      );
    }

    if (requestedTier !== "basic") {
      const client = createServerSupabaseClient();
      const configured = client
        ? await client
            .from("platform_settings")
            .select("settings")
            .eq("id", 1)
            .maybeSingle()
        : { data: null };
      const prices = configured.data?.settings?.tierPrices ?? {
        premium: 250000,
        vip: 500000,
      };
      const expectedCurrency =
        String(configured.data?.settings?.walletCurrency ?? "UGX").toUpperCase();
      const expectedPrice = Number(prices[requestedTier]);
      if (
        !Number.isFinite(expectedPrice) ||
        amount !== expectedPrice ||
        currency !== expectedCurrency
      ) {
        return NextResponse.json(
          {
            ok: false,
            reason: `The ${requestedTier} upgrade must use ${expectedCurrency} ${expectedPrice.toLocaleString()}.`,
          },
          { status: 400 },
        );
      }
    }

    const provider = createPaymentProvider(process.env);

    const order = await provider.createPaymentOrder({
      userId: identity.userId,
      amount,
      currency,
      qcPackageId,
      metadata: {
        source: "aqe-payment-init",
        origin: "server",
        requestedTier,
      },
    });

    const persisted = await persistPaymentOrder(order);

    if (!persisted.ok) {
      return NextResponse.json(
        { ok: false, reason: persisted.reason },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ...order,
      ...persisted,
      mode: order.mode === "mock" ? "mock" : "configured",
      status: "initiated",
      paymentInstruction:
        "Open Mukuru Send Money, complete the transfer using the AQE reference, then wait for manager/provider confirmation.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Gateway initialization failed",
      },
      { status: 400 },
    );
  }
}
