import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "QC service is not configured." }, { status: 503 });

    const wallet = await client.from("qc_wallet").select("balance,updated_at").eq("user_id", identity.userId).maybeSingle();
    if (wallet.error) return NextResponse.json({ ok: false, reason: wallet.error.message }, { status: 500 });
    const ledger = await client.from("qc_ledger")
      .select("id,transaction_type,amount,direction,balance_after,reference_type,reference_id,description,status,created_at")
      .eq("user_id", identity.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (ledger.error) return NextResponse.json({ ok: false, reason: ledger.error.message }, { status: 500 });

    return NextResponse.json({ ok: true, balance: Number(wallet.data?.balance ?? 0), updatedAt: wallet.data?.updated_at ?? null, ledger: ledger.data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "QC balance unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) {
      return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const qcAmount = Number(body.qcAmount ?? 0);
    if (!Number.isInteger(qcAmount) || qcAmount <= 0) {
      return NextResponse.json({ ok: false, reason: "Enter a positive whole QC amount." }, { status: 400 });
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: false, reason: "QC recharge service is not configured." }, { status: 503 });
    }

    const result = await client.rpc("recharge_qc_atomic", {
      p_user_id: identity.userId,
      p_qc_amount: qcAmount,
    });

    if (result.error) {
      return NextResponse.json({ ok: false, reason: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...((result.data ?? {}) as Record<string, unknown>) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reason: error instanceof Error ? error.message : "QC recharge failed.",
    }, { status: 400 });
  }
}
