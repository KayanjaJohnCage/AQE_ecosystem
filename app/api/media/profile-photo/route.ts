import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mediaId = String(body.mediaId ?? "").trim();
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

    if (!mediaId) {
      return NextResponse.json(
        { ok: false, reason: "Media ID is required." },
        { status: 400 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, reason: "Media service is unavailable." },
        { status: 503 },
      );
    }

    const { data: media, error: mediaError } = await client
      .from("profile_media")
      .select("id,storage_path,media_type,mime_type")
      .eq("id", mediaId)
      .eq("owner_user_id", identity.userId)
      .single();

    if (mediaError || !media) {
      return NextResponse.json(
        { ok: false, reason: mediaError?.message ?? "Media not found." },
        { status: 404 },
      );
    }

    if (media.media_type !== "image") {
      return NextResponse.json(
        { ok: false, reason: "Only an image can be used as a profile photo." },
        { status: 400 },
      );
    }

    const { error: clearError } = await client
      .from("profile_media")
      .update({ is_profile_photo: false, updated_at: new Date().toISOString() })
      .eq("owner_user_id", identity.userId);

    if (clearError) {
      return NextResponse.json(
        { ok: false, reason: clearError.message },
        { status: 500 },
      );
    }

    const { error: markError } = await client
      .from("profile_media")
      .update({ is_profile_photo: true, updated_at: new Date().toISOString() })
      .eq("id", media.id)
      .eq("owner_user_id", identity.userId);

    if (markError) {
      return NextResponse.json(
        { ok: false, reason: markError.message },
        { status: 500 },
      );
    }

    const { error: profileError } = await client
      .from("profiles")
      .update({
        avatar_url: media.storage_path,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", identity.userId);

    if (profileError) {
      return NextResponse.json(
        { ok: false, reason: profileError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, saved: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Profile photo update failed.",
      },
      { status: 400 },
    );
  }
}
