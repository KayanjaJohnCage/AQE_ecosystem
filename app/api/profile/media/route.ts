import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json(
        { ok: false, reason: "Authentication required." },
        { status: 401 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, source: "supabase", media: [] });
    }

    const { data, error } = await client
      .from("profile_media")
      .select(
        "id,storage_path,media_type,mime_type,file_size,visibility,moderation_status,is_profile_photo,created_at",
      )
      .eq("owner_user_id", session.userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
    }

    const media = [];
    for (const item of data ?? []) {
      const signed = await client.storage
        .from("profile-media")
        .createSignedUrl(item.storage_path, 3600);

      if (!signed.data?.signedUrl) continue;

      media.push({
        id: item.id,
        url: signed.data.signedUrl,
        type: item.media_type,
        mimeType: item.mime_type,
        fileSize: item.file_size,
        visibility: item.visibility,
        moderationStatus: item.moderation_status,
        isProfilePhoto: item.is_profile_photo,
        createdAt: item.created_at,
      });
    }

    return NextResponse.json({ ok: true, source: "supabase", media });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Profile media unavailable.",
      },
      { status: 500 },
    );
  }
}
