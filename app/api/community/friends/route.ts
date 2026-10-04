import { NextResponse } from "next/server";
import { resolveMutationUserId, requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const identity = await resolveMutationUserId(request);
  if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: true, requests: [] });
  const { data, error } = await client.from("friend_requests").select("id,sender_id,recipient_id,status,created_at,updated_at")
    .or(`sender_id.eq.${identity.userId},recipient_id.eq.${identity.userId}`)
    .order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    const recipientId = String(body.recipientId ?? "").trim();
    if (!recipientId || recipientId === identity.userId) return NextResponse.json({ ok: false, reason: "A different recipient is required." }, { status: 400 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Friend request service is unavailable." }, { status: 503 });
    const recipient = await client.from("profiles").select("user_id,display_name,verification_status,account_status").eq("user_id", recipientId).maybeSingle();
    if (recipient.error || !recipient.data) return NextResponse.json({ ok: false, reason: "Recipient is not a registered user." }, { status: 404 });
    if (String(recipient.data.verification_status || "").toLowerCase() !== "approved" || String(recipient.data.account_status || "").toLowerCase() !== "active") return NextResponse.json({ ok: false, reason: "Friend requests are only available for verified active members." }, { status: 403 });
    const existing = await client.from("friend_requests").select("id,status").eq("sender_id",identity.userId).eq("recipient_id",recipientId)
      .in("status",["pending","accepted"]).maybeSingle();
    if (existing.data) return NextResponse.json({ ok: false, reason: existing.data.status === "accepted" ? "You are already friends." : "Friend request already sent." }, { status: 409 });
    const inserted = await client.from("friend_requests").insert({ sender_id: identity.userId, recipient_id: recipientId, status: "pending" })
      .select("id,sender_id,recipient_id,status,created_at").single();
    if (inserted.error) return NextResponse.json({ ok: false, reason: inserted.error.message }, { status: 500 });
    await client.from("notifications").insert({
      user_id: recipientId, type: "friend_request", title: "New friend request",
      body: "You received a new friend request.", reference_type: "friend_request",
      reference_id: inserted.data.id, metadata: {}, created_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, saved: true, request: inserted.data, message: "Friend request sent successfully." });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Friend request failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["customer","manager","admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const id = String(body.requestId ?? "").trim();
    const status = String(body.status ?? "").toLowerCase();
    if (!id || !["accepted","rejected","cancelled"].includes(status)) return NextResponse.json({ ok: false, reason: "Invalid friend request decision." }, { status: 400 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Friend request service is unavailable." }, { status: 503 });
    const current = await client.from("friend_requests").select("*").eq("id",id).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ ok: false, reason: "Friend request not found." }, { status: 404 });
    const allowed = current.data.recipient_id === access.session.userId || current.data.sender_id === access.session.userId;
    if (!allowed) return NextResponse.json({ ok: false, reason: "You cannot modify this request." }, { status: 403 });
    const updated = await client.from("friend_requests").update({status,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
    if (updated.error) return NextResponse.json({ ok: false, reason: updated.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true, request: updated.data, message: "Friend request updated." });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Friend request update failed." }, { status: 400 });
  }
}