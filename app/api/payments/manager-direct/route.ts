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
        "id, user_id, amount, currency, qc_package_id, reference, provider, status, metadata, created_at",
      )
      .in("status", ["initiated", "pending"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error)
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
    return NextResponse.json({
      ok: true,
      source: "supabase",
      payments: data ?? [],
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
      .select("id, user_id, status, metadata")
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
    if (nextState === "confirmed") {
      const atomic = await client.rpc("confirm_payment_order_atomic", {
        p_order_id: orderId,
        p_actor_id: access.session.userId,
      });
      if (atomic.error) {
        return NextResponse.json(
          { ok: false, reason: atomic.error.message },
          { status: 500 },
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
      .select("id, status, updated_at")
      .single();
    if (updated.error)
      return NextResponse.json(
        { ok: false, reason: updated.error.message },
        { status: 500 },
      );

    return NextResponse.json({ ok: true, saved: true, payment: updated.data });
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
