export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 75 * 1024 * 1024;

type Tier = "basic" | "premium" | "vip";

async function getMediaLimitContext(userId: string, kind: "image" | "video") {
  const { createServerSupabaseClient } = await import("../supabaseServer");
  const client = createServerSupabaseClient();
  if (!client) return { ok: true as const, limited: false };
  const { data: profile, error: profileError } = await client.from("profiles").select("tier").eq("user_id", userId).maybeSingle();
  if (profileError) return { ok: false as const, reason: profileError.message };
  const tier: Tier = profile?.tier === "premium" || profile?.tier === "vip" ? profile.tier : "basic";
  const { data: settingsRow } = await client.from("platform_settings").select("settings").eq("id", 1).maybeSingle();
  const configured = settingsRow?.settings?.mediaLimits?.[tier] ?? {};
  const countLimit = Number(configured[kind === "image" ? "imagesPerMonth" : "videosPerMonth"] ?? (kind === "image" ? 10 : 2));
  const maxSizeMB = Number(configured[kind === "image" ? "maxImageSizeMB" : "maxVideoSizeMB"] ?? (kind === "image" ? 5 : 75));
  if (!Number.isFinite(countLimit) || countLimit < 0) return { ok: false as const, reason: "Invalid media upload limit configuration." };
  if (!Number.isFinite(maxSizeMB) || maxSizeMB <= 0) return { ok: false as const, reason: "Invalid media file size configuration." };
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await client.from("profile_media").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).eq("media_type", kind).gte("created_at", monthStart.toISOString());
  if (countError) return { ok: false as const, reason: countError.message };
  if ((count ?? 0) >= countLimit) return { ok: false as const, reason: "Your " + tier + " plan has reached its " + kind + " upload limit for this month." };
  return { ok: true as const, limited: true, tier, maxBytes: maxSizeMB * 1024 * 1024 };
}



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

  const limits = await getMediaLimitContext(userId, kind);
  if (!limits.ok) return limits;
  if (limits.limited && sizeBytes > limits.maxBytes) {
    return { ok: false, reason: kind + " exceeds the " + limits.tier + " plan's maximum file size." };
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
