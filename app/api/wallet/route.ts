import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../lib/aqe/auth";
import { applyWalletLedger } from "../../../lib/aqe/wallet";

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

    const result = applyWalletLedger({
      userId: identity.userId,
      amount: Number(body.amount ?? 0),
      currency: String(body.currency ?? "USD"),
      direction: body.direction === "debit" ? "debit" : "credit",
      referenceType: String(body.referenceType ?? "manual_topup"),
      referenceId: String(body.referenceId ?? `wallet-${Date.now()}`),
      currentBalance: Number(body.currentBalance ?? 0),
      status:
        body.status === "pending" || body.status === "failed"
          ? body.status
          : "completed",
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, reason: result.reason },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      balanceAfter: result.balanceAfter,
      ledgerEntry: result.ledgerEntry,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Wallet update failed",
      },
      { status: 400 },
    );
  }
}
