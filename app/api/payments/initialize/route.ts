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
    const paymentKind = String(body.kind ?? body.paymentKind ?? "wallet_deposit").trim().toLowerCase();


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

    {
      const client = createServerSupabaseClient();
      const configured = client
        ? await client
            .from("platform_settings")
            .select("settings")
            .eq("id", 1)
            .maybeSingle()
        : { data: null };
      const settings = configured.data?.settings ?? {};
      const prices = settings.pricing?.currentTierPrices ?? settings.tierPrices ?? {
        basic: 65000,
        premium: 150000,
        vip: 250000,
      };
      const expectedCurrency = String(settings.walletCurrency ?? "UGX").toUpperCase();
      const expectedPrice = Number(prices[requestedTier]);
      if (paymentKind === "membership_upgrade") {
        if (!Number.isFinite(expectedPrice) || amount !== expectedPrice || currency !== expectedCurrency) {
          return NextResponse.json({ ok: false, reason: `The ${requestedTier} payment must use ${expectedCurrency} ${expectedPrice.toLocaleString()}.` }, { status: 400 });
        }
      } else if (paymentKind === "qc_recharge") {
        const qcAmount = Number(body.qcAmount ?? 0);
        const expectedQcPrice = qcAmount * Number(settings.qcExchangeRate ?? 1000);
        if (!Number.isFinite(qcAmount) || qcAmount <= 0 || amount !== expectedQcPrice || currency !== expectedCurrency) {
          return NextResponse.json({ ok: false, reason: `QC recharge must match the configured QC exchange rate.` }, { status: 400 });
        }
      } else if (paymentKind === "wallet_deposit") {
        if (currency !== expectedCurrency) return NextResponse.json({ ok: false, reason: `Wallet deposits must use ${expectedCurrency}.` }, { status: 400 });
      } else if (paymentKind === "subscription_renewal") {
        const currentProfile = client
          ? await client.from("profiles").select("tier").eq("user_id", identity.userId).maybeSingle()
          : { data: null };
        if (currentProfile.data?.tier && normalizeTier(currentProfile.data.tier) !== requestedTier) {
          return NextResponse.json({ ok: false, reason: "Renewal tier must match your current membership tier. Upgrade first if you want a different tier." }, { status: 400 });
        }
        const renewal = Number(settings.renewalPrices?.[requestedTier] ?? 0);
        if (!Number.isFinite(renewal) || amount !== renewal || currency !== expectedCurrency) {
          return NextResponse.json({ ok: false, reason: `The ${requestedTier} renewal must use ${expectedCurrency} ${renewal.toLocaleString()}.` }, { status: 400 });
        }
      } else if (paymentKind === "vip_content_subscription") {
        const vipUserId = String(body.vipUserId ?? "").trim();
        if (!vipUserId || vipUserId === identity.userId) {
          return NextResponse.json({ ok: false, reason: "A different VIP profile is required." }, { status: 400 });
        }
        const vipSettings = client
          ? await client.from("vip_content_settings").select("vip_user_id,enabled,monthly_price,currency").eq("vip_user_id", vipUserId).maybeSingle()
          : { data: null };
        if (!vipSettings.data?.enabled || vipSettings.data.currency !== expectedCurrency || amount !== Number(vipSettings.data.monthly_price)) {
          return NextResponse.json({ ok: false, reason: "The VIP content subscription price is invalid or no longer available." }, { status: 400 });
        }
      } else {
        return NextResponse.json({ ok: false, reason: "Unsupported payment type." }, { status: 400 });
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
        paymentKind,
        qcAmount: paymentKind === "qc_recharge" ? Number(body.qcAmount ?? 0) : null,
        vipUserId: paymentKind === "vip_content_subscription" ? String(body.vipUserId ?? "").trim() : null,
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
