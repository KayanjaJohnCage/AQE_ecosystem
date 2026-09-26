import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { validateUpload, buildSignedStoragePath } from "../../../../lib/aqe/mediaUpload";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, reason: "Media file is required." }, { status: 400 });
    }

    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });

    const kind = file.type.startsWith("video/") ? "video" : "image";
    const validation = validateUpload({
      kind,
      mimeType: file.type,
      sizeBytes: file.size,
      fileName: file.name,
    });
    if (!validation.ok) return NextResponse.json({ ok: false, reason: validation.reason }, { status: 400 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Media service is unavailable." }, { status: 503 });

    const objectPath = buildSignedStoragePath(identity.userId, file.name, kind);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploaded = await client.storage.from("profile-media").upload(objectPath, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploaded.error) return NextResponse.json({ ok: false, reason: uploaded.error.message }, { status: 400 });

    const { data: profile } = await client.from("profiles").select("tier").eq("user_id", identity.userId).maybeSingle();
    const contentAccess = form.get("contentAccess") === "subscribers_only" && profile?.tier === "vip"
      ? "subscribers_only"
      : "public";

    const inserted = await client.from("profile_media").insert({
      owner_user_id: identity.userId,
      storage_path: objectPath,
      media_type: kind,
      mime_type: file.type,
      file_size: file.size,
      visibility: "public",
      moderation_status: "pending",
      content_access: contentAccess,
    }).select("id,storage_path,media_type,mime_type,file_size,visibility,moderation_status,is_profile_photo,created_at").single();

    if (inserted.error) {
      await client.storage.from("profile-media").remove([objectPath]);
      return NextResponse.json({ ok: false, reason: inserted.error.message }, { status: 400 });
    }

    const signed = await client.storage.from("profile-media").createSignedUrl(objectPath, 3600);
    return NextResponse.json({
      ok: true,
      media: {
        ...inserted.data,
        url: signed.data?.signedUrl ?? null,
        type: inserted.data.media_type,
        mimeType: inserted.data.mime_type,
        isProfilePhoto: inserted.data.is_profile_photo,
        createdAt: inserted.data.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Media upload failed." }, { status: 400 });
  }
}
