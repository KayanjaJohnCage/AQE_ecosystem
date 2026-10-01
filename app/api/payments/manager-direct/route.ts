import { NextResponse } from "next/server";
import {
  requireAuthenticatedRoleAccess,
  resolveMutationUserId,
} from "../../../../lib/aqe/auth";
import { createPaymentStateTransition } from "../../../../lib/aqe/financial";
import { persistPaymentOrder } from "../../../../lib/aqe/paymentProvider";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";
import { normalizeTier } from "../../../../lib/aqe/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(request);
    if (!identity.ok)
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );
    const amount = Number(body.amount ?? 0);
    const currency = String(body.currency ?? "UGX")
      .trim()
      .toUpperCase();
    const reference = String(
      body.reference ?? `AQE-MANAGER-${Date.now()}`,
    ).trim();
    const requestedTier = normalizeTier(
      typeof body.tier === "string" ? body.tier : "basic",
    );
    const paymentKind = String(body.kind ?? body.paymentKind ?? "wallet_deposit").trim().toLowerCase();

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !/^[A-Z]{3}$/.test(currency) ||
      !reference
    ) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Amount, currency, and payment reference are required.",
        },
        { status: 400 },
      );
    }

    if (paymentKind === "wallet_deposit" && amount < 5000) {
      return NextResponse.json(
        { ok: false, reason: "Minimum wallet deposit is UGX 5,000." },
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
          return NextResponse.json({ ok: false, reason: "QC recharge must match the configured QC exchange rate." }, { status: 400 });
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

    const senderDetails =
      body.senderDetails && typeof body.senderDetails === "object"
        ? (body.senderDetails as { name?: unknown; phone?: unknown })
        : null;
    if (paymentKind === "wallet_deposit" || paymentKind === "membership_upgrade") {
      const senderName = String(senderDetails?.name ?? "").trim();
      const senderPhone = String(senderDetails?.phone ?? "").trim();
      if (!senderName || !senderPhone) {
        return NextResponse.json(
          { ok: false, reason: "Sender registered name and sending phone number are required for Manager Direct payments." },
          { status: 400 },
        );
      }
    }

    const order = await persistPaymentOrder({
      userId: identity.userId,
      amount,
      currency,
      qcPackageId: String(body.qcPackageId ?? "wallet_deposit"),
      reference,
      provider: "AQE_MANAGER",
      mode: createServerSupabaseClient() ? "live" : "mock",
      metadata: {
        paymentMethod: "AQE_MANAGER",
        senderDetails: body.senderDetails ?? null,
        requestedTier,
        paymentKind,
        qcAmount: paymentKind === "qc_recharge" ? Number(body.qcAmount ?? 0) : null,
        vipUserId: paymentKind === "vip_content_subscription" ? String(body.vipUserId ?? "").trim() : null,
      },
    });
    if (!order.ok) return NextResponse.json(order, { status: 500 });

    return NextResponse.json({
      ok: true,
      status: "pending",
      order: order.order,
      message:
        "Manager Direct payment request queued for manager confirmation.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Manager direct payment failed",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, [
      "manager",
      "admin",
    ]);
    if (!access.ok)
      return NextResponse.json(
        { ok: false, reason: access.reason },
        { status: 403 },
      );
    const client = createServerSupabaseClient();
    if (!client)
      return NextResponse.json({ ok: true, source: "demo", payments: [] });
    const { data, error } = await client
      .from("payment_orders")
      .select(
        "id, user_id, amount, currency, qc_package_id, reference, provider, status, metadata, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error)
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );

    const rows = data ?? [];
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
    const profiles = userIds.length
      ? await client
          .from("profiles")
          .select("user_id,display_name,phone,tier,verification_status")
          .in("user_id", userIds)
      : { data: [] };
    const receiver = await client
      .from("payment_receiver_settings")
      .select("receiver_name,receiver_phone,receiver_card")
      .eq("id", 1)
      .maybeSingle();
    const receiverDetails = {
      name: receiver.data?.receiver_name || process.env.MUKURU_RECEIVER_NAME || "AQE Payments Receiver",
      phone: receiver.data?.receiver_phone || process.env.MUKURU_RECEIVER_PHONE || "Not configured",
      card: receiver.data?.receiver_card || process.env.MUKURU_RECEIVER_CARD || "Not configured",
    };
    const profileByUser = new Map(
      (profiles.data ?? []).map((profile) => [profile.user_id, profile]),
    );

    return NextResponse.json({
      ok: true,
      source: "supabase",
      payments: rows.map((row) => {
        const profile = profileByUser.get(row.user_id);
        const sender =
          row.metadata?.senderDetails && typeof row.metadata.senderDetails === "object"
            ? row.metadata.senderDetails
            : {};
        const terminal = ["confirmed", "rejected", "cancelled"].includes(row.status);
        return {
          ...row,
          displayStatus: row.status === "confirmed" ? "completed" : row.status,
          locked: terminal,
          senderName: String(sender.name ?? profile?.display_name ?? ""),
          senderPhone: String(sender.number ?? sender.phone ?? profile?.phone ?? ""),
          senderNetwork: String(sender.network ?? ""),
          receiverName: receiverDetails.name,
          receiverPhone: receiverDetails.phone,
          receiverCard: receiverDetails.card,
          sentAt: row.created_at,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Payment queue unavailable.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, [
      "manager",
      "admin",
    ]);
    if (!access.ok)
      return NextResponse.json(
        { ok: false, reason: access.reason },
        { status: 403 },
      );
    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId ?? "").trim();
    const nextState = String(body.status ?? "").trim();
    if (
      !orderId ||
      !["confirmed", "rejected", "cancelled"].includes(nextState)
    ) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Order ID and valid manager decision are required.",
        },
        { status: 400 },
      );
    }
    const client = createServerSupabaseClient();
    if (!client)
      return NextResponse.json({
        ok: true,
        saved: false,
        source: "memory",
        status: nextState,
      });
    const current = await client
      .from("payment_orders")
      .select("id, user_id, status, metadata, amount, currency, reference")
      .eq("id", orderId)
      .maybeSingle();
    if (current.error || !current.data)
      return NextResponse.json(
        {
          ok: false,
          reason: current.error?.message ?? "Payment order not found.",
        },
        { status: 404 },
      );

    if (["confirmed", "rejected", "cancelled"].includes(current.data.status)) {
      return NextResponse.json(
        {
          ok: false,
          locked: true,
          reason: `This payment request is locked because it is already ${current.data.status === "confirmed" ? "completed" : current.data.status}.`,
        },
        { status: 409 },
      );
    }

    if (nextState === "confirmed") {
      const atomic = await client.rpc("confirm_payment_order_atomic", {
        p_order_id: orderId,
        p_actor_id: access.session.userId,
      });
      if (atomic.error) {
        const missingConfirmationRpc =
          atomic.error.code === "PGRST202" ||
          /confirm_payment_order_atomic/i.test(atomic.error.message || "");
        return NextResponse.json(
          {
            ok: false,
            reason: missingConfirmationRpc
              ? "Payment confirmation is not enabled in the live Supabase database. Apply migrations/0050_repair_payment_confirmation_rpc.sql in Supabase SQL Editor, then retry Confirm & upgrade."
              : atomic.error.message,
          },
          { status: missingConfirmationRpc ? 503 : 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        saved: true,
        payment: atomic.data,
        upgradedTier: atomic.data?.upgradedTier ?? null,
      });
    }

    const transition = createPaymentStateTransition({
      currentState: current.data.status,
      nextState: nextState as any,
    });
    if (!transition.ok) return NextResponse.json(transition, { status: 409 });
    const updated = await client
      .from("payment_orders")
      .update({ status: nextState, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .in("status", ["initiated", "pending"])
      .select("id, user_id, amount, currency, reference, metadata, status, updated_at")
      .single();
    if (updated.error)
      return NextResponse.json(
        { ok: false, reason: updated.error.message },
        { status: 500 },
      );

    if (updated.error)
      return NextResponse.json(
        { ok: false, reason: updated.error.message },
        { status: 500 },
      );

    if (updated.data?.user_id) {
      await client.rpc("aqe_notify", {
        p_user_id: updated.data.user_id,
        p_type: nextState === "rejected" ? "payment_rejected" : "payment_cancelled",
        p_title: nextState === "rejected" ? "Payment request rejected" : "Payment request cancelled",
        p_body: `Your AQE payment request ${updated.data.reference} was ${nextState} by the manager.`,
        p_reference_type: "payment_order",
        p_reference_id: updated.data.id,
        p_dedupe_key: `PAYMENT-${nextState.toUpperCase()}-${updated.data.id}`,
        p_metadata: {
          status: nextState,
          amount: updated.data.amount,
          currency: updated.data.currency,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      payment: {
        ...updated.data,
        displayStatus: nextState === "confirmed" ? "completed" : nextState,
        locked: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Manager payment decision failed.",
      },
      { status: 400 },
    );
  }
}
