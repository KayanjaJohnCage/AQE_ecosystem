import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveAuthenticatedSession } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, reason: "Prize claims are not configured." }, { status: 503 });
  const manager = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
  if (!manager.ok) return NextResponse.json({ ok: false, reason: manager.reason }, { status: 403 });
  const { data, error } = await client.from("aqe_prize_claims")
    .select("id,prize_id,user_id,mode,status,cash_amount,manager_note,approved_by,approved_at,fulfilled_at,created_at,aqe_prizes(ref_code,title,reward_description)")
    .order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, claims: data ?? [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Prize claims are not configured." }, { status: 503 });

    const managerAccess = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    const isManager = managerAccess.ok;

    if (isManager && body.action === "cash_approve") {
      const claimId = String(body.claimId ?? "").trim();
      const cashAmount = Number(body.cashAmount ?? 0);
      const note = String(body.note ?? "").trim();
      if (!claimId || !Number.isFinite(cashAmount) || cashAmount <= 0) return NextResponse.json({ ok: false, reason: "Claim ID and a positive cash amount are required." }, { status: 400 });
      const result = await client.rpc("approve_prize_cash_claim", {
        p_claim_id: claimId, p_manager_id: managerAccess.session.userId,
        p_cash_amount: cashAmount, p_note: note || null,
      });
      if (result.error) return NextResponse.json({ ok: false, reason: result.error.message }, { status: 400 });
      return NextResponse.json(result.data);
    }

    if (isManager && body.action === "fulfill") {
      const claimId = String(body.claimId ?? "").trim();
      if (!claimId) return NextResponse.json({ ok: false, reason: "Claim ID is required." }, { status: 400 });
      const updated = await client.from("aqe_prize_claims")
        .update({ status: "fulfilled", fulfilled_at: new Date().toISOString(), updated_at: new Date().toISOString(), manager_note: String(body.note ?? "").trim() || null })
        .eq("id", claimId).in("status", ["pending", "approved"]).select().maybeSingle();
      if (updated.error) return NextResponse.json({ ok: false, reason: updated.error.message }, { status: 400 });
      if (!updated.data) return NextResponse.json({ ok: false, reason: "Open prize claim not found." }, { status: 404 });
      return NextResponse.json({ ok: true, claim: updated.data });
    }

    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
    const mode = String(body.mode ?? "physical").toLowerCase();
    const prizeId = String(body.prizeId ?? "").trim();
    if (!prizeId || !["physical", "cash"].includes(mode)) return NextResponse.json({ ok: false, reason: "Prize and claim mode are required." }, { status: 400 });
    const result = await client.rpc("request_prize_claim", { p_user_id: session.userId, p_prize_id: prizeId, p_mode: mode });
    if (result.error) return NextResponse.json({ ok: false, reason: result.error.message }, { status: 400 });
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Prize claim failed." }, { status: 400 });
  }
}
