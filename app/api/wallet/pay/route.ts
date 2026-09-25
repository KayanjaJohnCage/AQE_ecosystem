import { NextResponse } from "next/server";
import { normalizeTier, resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Wallet payments are not configured." }, { status: 503 });

    const paymentKind = String(body.paymentKind ?? body.kind ?? "").trim().toLowerCase();
    const tier = normalizeTier(typeof body.tier === "string" ? body.tier : "basic");
    const settingsRow = await client.from("platform_settings").select("settings").eq("id", 1).maybeSingle();
    const settings = settingsRow.data?.settings ?? {};
    const currency = String(settings.walletCurrency ?? "UGX").toUpperCase();
    const prices = settings.pricing?.currentTierPrices ?? settings.tierPrices ?? { basic: 65000, premium: 150000, vip: 250000 };

    let amount = 0;
    const metadata: Record<string, unknown> = {
      source: "aqe-wallet",
      paymentKind,
      requestedTier: tier,
      fundingSource: "wallet",
    };

    if (paymentKind === "membership_upgrade") {
      amount = Number(prices[tier]);
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, reason: "The selected membership price is not configured." }, { status: 400 });
    } else if (paymentKind === "qc_recharge") {
      const qcAmount = Number(body.qcAmount ?? 0);
      const rate = Number(settings.qcExchangeRate ?? 1000);
      amount = qcAmount * rate;
      if (!Number.isFinite(qcAmount) || qcAmount <= 0 || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amount)) return NextResponse.json({ ok: false, reason: "Invalid QC recharge amount." }, { status: 400 });
      metadata.qcAmount = qcAmount;
    } else if (paymentKind === "vip_content_subscription") {
      const vipUserId = String(body.vipUserId ?? "").trim();
      if (!vipUserId || vipUserId === identity.userId) return NextResponse.json({ ok: false, reason: "A different VIP profile is required." }, { status: 400 });
      const vipSettings = await client.from("vip_content_settings").select("vip_user_id,enabled,monthly_price,currency").eq("vip_user_id", vipUserId).maybeSingle();
      if (!vipSettings.data?.enabled || vipSettings.data.currency !== currency) return NextResponse.json({ ok: false, reason: "VIP content subscription is not available." }, { status: 400 });
      amount = Number(vipSettings.data.monthly_price);
      metadata.vipUserId = vipUserId;
    } else {
      return NextResponse.json({ ok: false, reason: "Unsupported wallet payment." }, { status: 400 });
    }

    const reference = "AQE-WALLET-" + Date.now();
    const inserted = await client.from("payment_orders").insert({
      user_id: identity.userId,
      amount,
      currency,
      qc_package_id: paymentKind === "qc_recharge" ? "wallet-qc" : paymentKind,
      reference,
      provider: "AQE_WALLET",
      mode: "live",
      status: "initiated",
      metadata,
    }).select("id,user_id,amount,currency,reference,status,metadata").single();

    if (inserted.error || !inserted.data) return NextResponse.json({ ok: false, reason: inserted.error?.message || "Wallet payment order could not be created." }, { status: 500 });

    const confirmed = await client.rpc("confirm_wallet_payment_atomic", {
      p_order_id: inserted.data.id,
      p_user_id: identity.userId,
    });

    if (confirmed.error) {
      await client.from("payment_orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", inserted.data.id).eq("status", "initiated");
      return NextResponse.json({ ok: false, reason: confirmed.error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      status: "confirmed",
      order: inserted.data,
      payment: confirmed.data,
      message: paymentKind === "membership_upgrade"
        ? "Wallet payment confirmed and membership upgraded."
        : "Wallet payment confirmed successfully.",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Wallet payment failed." }, { status: 400 });
  }
}
