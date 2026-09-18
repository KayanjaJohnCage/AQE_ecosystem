import { normalizeTier } from "./auth";
import { createServerSupabaseClient } from "../supabaseServer";

export type ProfileTier = "basic" | "premium" | "vip";

export type ProfileRecord = {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  phone?: string;
  country?: string;
  location?: string;
  category?: string;
  services?: string[];
  tier: ProfileTier;
  verificationStatus:
    | "unverified"
    | "pending"
    | "approved"
    | "rejected"
    | "resubmission_required";
  profilePhotoId?: string;
  createdAt: string;
  updatedAt: string;
};

export function createProfileRecord({
  userId,
  displayName,
  tier = "basic",
  verificationStatus = "pending",
}: {
  userId: string;
  displayName: string;
  tier?: ProfileTier;
  verificationStatus?: ProfileRecord["verificationStatus"];
}): { ok: boolean; profile?: ProfileRecord; reason?: string } {
  if (!userId || !displayName) {
    return { ok: false, reason: "User ID and display name are required." };
  }

  const now = new Date().toISOString();

  return {
    ok: true,
    profile: {
      id: `profile-${Date.now()}`,
      userId,
      displayName,
      tier,
      verificationStatus,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function persistProfileRecord(profile: ProfileRecord) {
  const client = createServerSupabaseClient();

  if (!client) {
    return { ok: true, saved: false, source: "memory", profile };
  }

  try {
    const payload = {
      user_id: profile.userId,
      display_name: profile.displayName,
      bio: profile.bio ?? null,
      phone: profile.phone ?? null,
      country: profile.country ?? null,
      location: profile.location ?? null,
      category: profile.category ?? null,
      services: profile.services ?? [],
      tier: profile.tier,
      verification_status: profile.verificationStatus,
      avatar_url: profile.profilePhotoId ?? null,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    };

    const { data, error } = await client
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .maybeSingle();

    if (error) {
      return {
        ok: true,
        saved: false,
        source: "memory",
        profile,
        reason: error.message,
      };
    }

    return {
      ok: true,
      saved: true,
      source: "supabase",
      profile: {
        ...profile,
        id: data?.id ?? profile.id,
      },
    };
  } catch (error) {
    return {
      ok: true,
      saved: false,
      source: "memory",
      profile,
      reason:
        error instanceof Error ? error.message : "Profile persistence failed",
    };
  }
}

export async function getProfileByUserId(userId: string) {
  const client = createServerSupabaseClient();

  if (!client) {
    return { ok: true, found: false, profile: null, source: "memory" };
  }

  try {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return {
        ok: true,
        found: false,
        profile: null,
        source: "memory",
        reason: error.message,
      };
    }

    if (!data) {
      return { ok: true, found: false, profile: null, source: "supabase" };
    }

    return {
      ok: true,
      found: true,
      source: "supabase",
      profile: {
        id: data.id,
        userId: data.user_id,
        displayName: data.display_name,
        bio: data.bio ?? undefined,
        phone: data.phone ?? undefined,
        country: data.country ?? undefined,
        location: data.location ?? undefined,
        category: data.category ?? undefined,
        services: Array.isArray(data.services) ? data.services : undefined,
        tier: (data.tier as ProfileTier) ?? "basic",
        verificationStatus:
          (data.verification_status as ProfileRecord["verificationStatus"]) ??
          "pending",
        profilePhotoId: data.avatar_url ?? undefined,
        createdAt: data.created_at ?? new Date().toISOString(),
        updatedAt: data.updated_at ?? new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      ok: true,
      found: false,
      profile: null,
      source: "memory",
      reason: error instanceof Error ? error.message : "Profile lookup failed",
    };
  }
}

export function sanitizeProfilePayload(input: Record<string, unknown>) {
  return {
    displayName:
      typeof input.displayName === "string" ? input.displayName.trim() : "",
    bio: typeof input.bio === "string" ? input.bio.trim() : undefined,
    phone: typeof input.phone === "string" ? input.phone.trim() : undefined,
    country:
      typeof input.country === "string" ? input.country.trim() : undefined,
    location:
      typeof input.location === "string" ? input.location.trim() : undefined,
    category:
      typeof input.category === "string" ? input.category.trim() : undefined,
    services: Array.isArray(input.services)
      ? input.services.filter((item) => typeof item === "string")
      : undefined,
    tier: normalizeTier(
      typeof input.tier === "string" ? input.tier : undefined,
    ),
  };
}
