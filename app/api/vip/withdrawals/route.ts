import { NextResponse } from "next/server";
import {
  requireAuthenticatedRoleAccess,
  resolveMutationUserId,
} from "../../../../lib/aqe/auth";
import {
  createPersistedVipWithdrawalRequest,
  type WithdrawalTier,
} from "../../../../lib/aqe/vip";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

const PAYMENT_METHODS = ["AIRTEL_MONEY", "MOBILE_MONEY", "CARD"] as const;

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
    const recipientName = String(body.recipientName ?? "").trim();
    const recipientAccount = String(body.recipientAccount ?? "").trim();
    const paymentMethod = String(body.paymentMethod ?? "").trim();
    const currency = String(body.currency ?? "UGX").trim().toUpperCase();

    if (!recipientName || !recipientAccount || !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Receiver name, phone/card number, and payment method are required.",
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, reason: "Enter a valid withdrawal amount." },
        { status: 400 },
      );
    }

    if (!["UGX", "USDT"].includes(currency)) {
      return NextResponse.json(
        { ok: false, reason: "Unsupported withdrawal currency." },
        { status: 400 },
      );
    }

    const result = await createPersistedVipWithdrawalRequest({
      userId: identity.userId,
      amount,
      tier:
        body.tier === "basic" || body.tier === "premium" || body.tier === "vip"
          ? (body.tier as WithdrawalTier)
          : undefined,
      recipientName,
      recipientAccount,
      paymentMethod,
      currency,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Withdrawal failed",
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
      return NextResponse.json(
        { ok: false, reason: "Withdrawal queue is unavailable." },
        { status: 503 },
      );

    const { data, error } = await client
      .from("vip_withdrawal_requests")
      .select(
        "id, user_id, tier, payment_method, recipient_name, recipient_account, currency, amount, service_charge_rate, service_charge_amount, net_amount, status, created_at, reviewed_at, reviewed_by, review_reason",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error)
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );

    return NextResponse.json({
      ok: true,
      source: "supabase",
      withdrawals: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Withdrawal queue unavailable.",
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
    const requestId = String(body.requestId ?? "").trim();
    const status = String(body.status ?? "").trim();

    if (
      !requestId ||
      !["APPROVED", "REJECTED", "PAID", "CANCELLED"].includes(status)
    ) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Withdrawal ID and valid manager decision are required.",
        },
        { status: 400 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client)
      return NextResponse.json(
        { ok: false, reason: "Withdrawal queue is unavailable." },
        { status: 503 },
      );

    const updated = await client
      .from("vip_withdrawal_requests")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: access.session?.userId,
        review_reason: body.reason ? String(body.reason) : null,
      })
      .eq("id", requestId)
      .eq("status", "PENDING")
      .select(
        "id, tier, payment_method, recipient_name, recipient_account, currency, amount, service_charge_rate, service_charge_amount, net_amount, status, reviewed_at, reviewed_by, review_reason",
      )
      .single();

    if (updated.error || !updated.data)
      return NextResponse.json(
        {
          ok: false,
          reason: updated.error?.message ?? "Pending withdrawal not found.",
        },
        { status: 409 },
      );

    return NextResponse.json({
      ok: true,
      saved: true,
      withdrawal: updated.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Withdrawal decision failed.",
      },
      { status: 400 },
    );
  }
}
