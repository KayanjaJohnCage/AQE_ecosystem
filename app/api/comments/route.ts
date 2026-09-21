import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../lib/aqe/auth";
import {
  persistProfileComment,
  validateCommunityText,
} from "../../../lib/aqe/community";

type CommentRow = {
  id: string;
  profile_id: string;
  body: string;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok)
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );

    const { createServerSupabaseClient } = await import(
      "../../../lib/supabaseServer"
    );
    const client = createServerSupabaseClient();
    if (!client)
      return NextResponse.json({ ok: true, source: "demo", comments: [] });

    const { data, error } = await client
      .from("profile_comments")
      .select("id, profile_id, body, created_at")
      .eq("author_id", identity.userId)
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
      comments: (data ?? []).map((comment: CommentRow) => ({
        id: comment.id,
        profileId: comment.profile_id,
        body: comment.body,
        createdAt: comment.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Comments unavailable.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(
      request,
      typeof body.authorId === "string" ? body.authorId : undefined,
    );
    if (!identity.ok)
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );

    const profileId = String(body.profileId ?? "").trim();
    const text = validateCommunityText(body.body, "Comment");
    if (!profileId || !text.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: profileId ? text.reason : "Profile ID is required.",
        },
        { status: 400 },
      );
    }

    const result = await persistProfileComment({
      authorId: identity.userId,
      profileId,
      body: text.text,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Comment creation failed",
      },
      { status: 400 },
    );
  }
}
