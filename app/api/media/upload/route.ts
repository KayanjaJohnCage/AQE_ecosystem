import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../../lib/aqe/auth";
import {
  createMediaUploadUrl,
  validateUpload,
} from "../../../../lib/aqe/mediaUpload";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const kind = body.kind === "video" ? "video" : "image";
    const mimeType = String(body.mimeType ?? "");
    const sizeBytes = Number(body.sizeBytes ?? 0);
    const fileName = String(body.fileName ?? "");
    const contentAccess = body.contentAccess === "subscribers_only" ? "subscribers_only" : "public";
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

    const validation = validateUpload({ kind, mimeType, sizeBytes, fileName });
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, reason: validation.reason },
        { status: 400 },
      );
    }

    const upload = await createMediaUploadUrl({
      userId: identity.userId,
      fileName,
      kind,
      mimeType,
      sizeBytes,
      contentAccess,
    });

    return NextResponse.json(
      { ...upload, kind, uploadBucket: "profile-media" },
      { status: upload.ok ? 200 : 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Media upload validation failed",
      },
      { status: 400 },
    );
  }
}
