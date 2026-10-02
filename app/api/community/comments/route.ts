import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, comments: [] });
    const profileId = new URL(request.url).searchParams.get("profileId")?.trim();
    if (!profileId) return NextResponse.json({ ok: false, reason: "Profile ID is required." }, { status: 400 });
    const { data, error } = await client.from("profile_comments")
      .select("id,author_id,profile_id,body,created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, comments: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Comments unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    const profileId = String(body.profileId ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!profileId || !text) return NextResponse.json({ ok: false, reason: "Profile and comment are required." }, { status: 400 });
    if (text.length > 1000) return NextResponse.json({ ok: false, reason: "Comment is too long." }, { status: 400 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Comment service is unavailable." }, { status: 503 });
    const target = await client.from("profiles").select("user_id,display_name,verification_status,account_status").eq("id", profileId).maybeSingle();
    if (target.error || !target.data) return NextResponse.json({ ok: false, reason: "Profile not found." }, { status: 404 });
    if (String(target.data.verification_status || "").toLowerCase() !== "approved" || String(target.data.account_status || "").toLowerCase() !== "active") return NextResponse.json({ ok: false, reason: "Comments are only available on verified active member profiles." }, { status: 403 });
    if (target.data.user_id === identity.userId) return NextResponse.json({ ok: false, reason: "You cannot comment on your own profile." }, { status: 400 });
    const inserted = await client.from("profile_comments").insert({
      author_id: identity.userId, profile_id: profileId, body: text,
    }).select("id,author_id,profile_id,body,created_at").single();
    if (inserted.error) return NextResponse.json({ ok: false, reason: inserted.error.message }, { status: 500 });
    await client.from("notifications").insert({
      user_id: target.data.user_id, type: "profile_comment", title: "New profile comment",
      body: "Someone commented on your profile.", reference_type: "profile_comment",
      reference_id: inserted.data.id, metadata: { profileId }, created_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, saved: true, comment: inserted.data, message: "Comment posted successfully." });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Comment failed." }, { status: 400 });
  }
}