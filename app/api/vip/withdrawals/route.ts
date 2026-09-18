import { NextResponse } from "next/server";
import {
  requireAuthenticatedRoleAccess,
  resolveMutationUserId,
} from "../../../../lib/aqe/auth";
import { createPersistedVipWithdrawalRequest } from "../../../../lib/aqe/vip";
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

    const result = await createPersistedVipWithdrawalRequest({
      userId: identity.userId,
      amount: Number(body.amount ?? 0),
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "VIP withdrawal failed",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, source: "demo", withdrawals: [] });
    const { data, error } = await client
      .from("vip_withdrawal_requests")
      .select("id, user_id, amount, status, created_at, reviewed_at, reviewed_by, review_reason")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, source: "supabase", withdrawals: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Withdrawal queue unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const requestId = String(body.requestId ?? "").trim();
    const status = String(body.status ?? "").trim();
    if (!requestId || !["APPROVED", "REJECTED", "PAID", "CANCELLED"].includes(status)) {
      return NextResponse.json({ ok: false, reason: "Withdrawal ID and valid manager decision are required." }, { status: 400 });
    }
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, saved: false, source: "memory", status });
    const updated = await client
      .from("vip_withdrawal_requests")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: access.session?.userId, review_reason: body.reason ? String(body.reason) : null })
      .eq("id", requestId)
      .eq("status", "PENDING")
      .select("id, status, reviewed_at, reviewed_by, review_reason")
      .single();
    if (updated.error || !updated.data) return NextResponse.json({ ok: false, reason: updated.error?.message ?? "Pending withdrawal not found." }, { status: 409 });
    return NextResponse.json({ ok: true, saved: true, withdrawal: updated.data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Withdrawal decision failed." }, { status: 400 });
  }
}
