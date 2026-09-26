import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createMediaUploadUrl, validateUpload } from "../../../../lib/aqe/mediaUpload";
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

    const upload = await createMediaUploadUrl({
      userId: identity.userId,
      fileName: file.name,
      kind,
      mimeType: file.type,
      sizeBytes: file.size,
      contentAccess: form.get("contentAccess") === "subscribers_only" ? "subscribers_only" : "public",
    });
    if (!upload.ok || !upload.objectPath) {
      return NextResponse.json({ ok: false, reason: upload.reason ?? "Could not prepare media upload." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await client.storage.from("profile-media").upload(upload.objectPath, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (stored.error) {
      await client.from("profile_media").delete().eq("owner_user_id", identity.userId).eq("storage_path", upload.objectPath);
      return NextResponse.json({ ok: false, reason: stored.error.message }, { status: 400 });
    }

    const signed = await client.storage.from("profile-media").createSignedUrl(upload.objectPath, 3600);
    return NextResponse.json({
      ok: true,
      media: {
        objectPath: upload.objectPath,
        url: signed.data?.signedUrl ?? null,
        type: kind,
        mimeType: file.type,
        moderationStatus: "pending",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Media upload failed." }, { status: 400 });
  }
}
