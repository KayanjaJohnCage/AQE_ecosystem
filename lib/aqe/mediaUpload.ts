export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 75 * 1024 * 1024;

export function validateUpload({
  kind,
  mimeType,
  sizeBytes,
  fileName,
}: {
  kind: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}) {
  const cleanName = fileName.trim();
  const allowed = kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  if (!cleanName) return { ok: false, reason: "File name is required." };
  if (!allowed.includes(mimeType))
    return { ok: false, reason: `Unsupported ${kind} type.` };
  if (sizeBytes > maxBytes)
    return { ok: false, reason: `${kind} upload exceeds the size limit.` };

  return { ok: true };
}

export function buildSignedStoragePath(
  userId: string,
  fileName: string,
  kind: "image" | "video",
) {
  const cleanBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${userId}/${kind}/${Date.now()}-${cleanBase}`;
}

export async function createMediaUploadUrl({
  userId,
  fileName,
  kind,
  mimeType,
  sizeBytes,
}: {
  userId: string;
  fileName: string;
  kind: "image" | "video";
  mimeType: string;
  sizeBytes: number;
}) {
  const { createServerSupabaseClient } = await import("../supabaseServer");
  const client = createServerSupabaseClient();

  if (!client) {
    return {
      ok: true,
      source: "demo",
      bucket: "profile-media",
      objectPath: buildSignedStoragePath(userId, fileName, kind),
    };
  }

  const objectPath = buildSignedStoragePath(userId, fileName, kind);
  const { data, error } = await client.storage
    .from("profile-media")
    .createSignedUploadUrl(objectPath);

  if (error || !data) {
    return {
      ok: false,
      reason: error?.message ?? "Could not create signed upload URL.",
    };
  }

  const { error: mediaError } = await client.from("profile_media").insert({
    owner_user_id: userId,
    storage_path: objectPath,
    media_type: kind,
    mime_type: mimeType,
    file_size: sizeBytes,
    visibility: "private",
    moderation_status: "pending",
  });

  if (mediaError) {
    return { ok: false, reason: mediaError.message };
  }

  return {
    ok: true,
    source: "supabase",
    bucket: "profile-media",
    objectPath,
    token: data.token,
    path: data.path,
  };
}
