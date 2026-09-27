import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    const requestedChange = String(body.requestedChange ?? "other");
    const details = String(body.details ?? "").trim();
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Troubleshooting service is not configured." }, { status: 503 });
    const { data, error } = await client.rpc("create_account_troubleshoot_request_atomic", {
      p_user_id: identity.userId,
      p_requested_change: requestedChange,
      p_details: details,
    });
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: false, reason: "Troubleshoot request failed." }, { status: data?.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Troubleshoot request failed." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, requests: [] });
    const { data, error } = await client.from("account_troubleshoot_requests")
      .select("id,user_id,requested_change,details,qc_charge,status,created_at,updated_at,resolved_by,resolved_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, requests: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Troubleshoot queue unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const requestId = String(body.requestId ?? "").trim();
    const status = String(body.status ?? "").toUpperCase();
    if (!requestId || !["OPEN","IN_PROGRESS","RESOLVED","REJECTED"].includes(status)) return NextResponse.json({ ok: false, reason: "Invalid troubleshoot status." }, { status: 400 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, saved: false });
    const { data, error } = await client.from("account_troubleshoot_requests").update({
      status, updated_at: new Date().toISOString(), resolved_by: ["RESOLVED","REJECTED"].includes(status) ? access.session.userId : null,
      resolved_at: ["RESOLVED","REJECTED"].includes(status) ? new Date().toISOString() : null,
    }).eq("id",requestId).select().single();
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true, request: data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Troubleshoot update failed." }, { status: 400 });
  }
}
