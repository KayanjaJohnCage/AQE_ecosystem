import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import { createMediaUploadUrl } from "../../../../lib/aqe/mediaUpload";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });

    const fileName = String(body.fileName ?? "").trim();
    const kind = String(body.kind ?? "image") as "image" | "video";
    const mimeType = String(body.mimeType ?? "").trim();
    const sizeBytes = Number(body.sizeBytes ?? 0);
    const contentAccess = body.contentAccess === "subscribers_only" ? "subscribers_only" : "public";

    if (!fileName || !["image","video"].includes(kind) || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return NextResponse.json({ ok: false, reason: "File name, media type, MIME type and size are required." }, { status: 400 });
    }

    const result = await createMediaUploadUrl({
      userId: identity.userId,
      fileName,
      kind,
      mimeType,
      sizeBytes,
      contentAccess,
    });

    if (!result.ok) return NextResponse.json(result, { status: 400 });

    return NextResponse.json({
      ok: true,
      bucket: result.bucket,
      objectPath: result.objectPath,
      token: result.token,
      mediaId: result.mediaId,
      source: result.source,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Could not prepare media upload." }, { status: 400 });
  }
}