import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

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
