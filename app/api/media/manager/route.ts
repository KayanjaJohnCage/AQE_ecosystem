import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) {
      return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: false, reason: "Media service unavailable." }, { status: 503 });
    }

    const { data, error } = await client
      .from("profile_media")
      .select(
        "id,owner_user_id,storage_path,media_type,mime_type,file_size,visibility,moderation_status,is_profile_photo,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    }

    const media = [];
    for (const item of data ?? []) {
      const signed = await client.storage
        .from("profile-media")
        .createSignedUrl(item.storage_path, 3600);
      media.push({
        id: item.id,
        ownerUserId: item.owner_user_id,
        url: signed.data?.signedUrl || "",
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
      { ok: false, reason: error instanceof Error ? error.message : "Media queue unavailable." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) {
      return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const mediaId = String(body.mediaId ?? "").trim();
    const status = String(body.status ?? "").trim().toLowerCase();

    if (!mediaId || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { ok: false, reason: "Media ID and a valid moderation status are required." },
        { status: 400 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: false, reason: "Media service unavailable." }, { status: 503 });
    }

    const { data, error } = await client
      .from("profile_media")
      .update({
        moderation_status: status,
        visibility: status === "approved" ? "public" : "private",
        updated_at: new Date().toISOString(),
      })
      .eq("id", mediaId)
      .select("id,moderation_status,visibility,is_profile_photo")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, reason: error?.message ?? "Media item not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, saved: true, media: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Media moderation failed." },
      { status: 400 },
    );
  }
}
