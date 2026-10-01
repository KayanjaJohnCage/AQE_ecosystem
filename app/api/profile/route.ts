import { NextResponse } from "next/server";
import { resolveMutationUserId } from "../../../lib/aqe/auth";
import {
  createProfileRecord,
  persistProfileRecord,
  sanitizeProfilePayload,
} from "../../../lib/aqe/profile";

export async function GET(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) {
      return NextResponse.json(
        { ok: false, reason: identity.reason },
        { status: 401 },
      );
    }

    const client = (await import("../../../lib/supabaseServer")).createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, source: "memory", profile: null });
    }

    const { data, error } = await client
      .from("profiles")
      .select(
        "id, user_id, display_name, bio, phone, country, nationality, location, area, category, services, content_categories, age, gender, pronouns, headline, languages, availability, timezone, visibility, social_platforms, contact_methods, tier, verification_status, profile_photo_id, account_status, created_at, updated_at",
      )
      .eq("user_id", identity.userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ ok: true, source: "supabase", profile: null });
    }

    let avatarUrl = "";
    if (data.profile_photo_id) {
      const media = await client
        .from("profile_media")
        .select("storage_path,is_profile_photo,moderation_status")
        .eq("id", data.profile_photo_id)
        .maybeSingle();
      if (!media.error && media.data?.storage_path && media.data.is_profile_photo) {
        const signed = await client.storage
          .from("profile-media")
          .createSignedUrl(media.data.storage_path, 3600);
        avatarUrl = signed.data?.signedUrl || "";
      }
    }
    return NextResponse.json({
      ok: true,
      source: "supabase",
      profile: {
        id: data.id,
        userId: data.user_id,
        displayName: data.display_name,
        bio: data.bio,
        phone: data.phone,
        country: data.country,
        nationality: data.nationality,
        location: data.location,
        category: data.category,
        services: Array.isArray(data.services) ? data.services : [],
        contentCategories: Array.isArray(data.content_categories) ? data.content_categories : [],
        age: data.age,
        gender: data.gender,
        pronouns: data.pronouns,
        headline: data.headline,
        languages: Array.isArray(data.languages) ? data.languages : [],
        area: data.area,
        availability: data.availability,
        timezone: data.timezone,
        visibility: data.visibility,
        socialPlatforms: data.social_platforms ?? {},
        contactMethods: data.contact_methods ?? {},
        tier: data.tier,
        verificationStatus: data.verification_status,
        profilePhotoId: data.profile_photo_id,
        accountStatus: data.account_status || "active",
        avatarUrl,
        tierVerified: data.verification_status === "approved",
        membershipStatus: data.verification_status === "approved" ? "active" : "pending_payment",
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Profile lookup failed",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
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

    const sanitized = sanitizeProfilePayload(body);
    const result = createProfileRecord({
      userId: identity.userId,
      displayName: sanitized.displayName || "AQE User",
      tier: "basic",
      verificationStatus: "pending",
      bio: sanitized.bio,
      phone: sanitized.phone,
      country: sanitized.country,
      nationality: sanitized.nationality,
      location: sanitized.location,
      category: sanitized.category,
    });

    if (!result.ok || !result.profile) {
      return NextResponse.json(
        { ok: false, reason: result.reason },
        { status: 400 },
      );
    }

    Object.assign(result.profile, {
      services: sanitized.services,
      contentCategories: sanitized.contentCategories,
      age: sanitized.age,
      gender: sanitized.gender,
      pronouns: sanitized.pronouns,
      headline: sanitized.headline,
      languages: sanitized.languages,
      area: sanitized.area,
      availability: sanitized.availability,
      timezone: sanitized.timezone,
      visibility: sanitized.visibility,
      socialPlatforms: sanitized.socialPlatforms,
      contactMethods: sanitized.contactMethods,
    });
    const persisted = await persistProfileRecord(result.profile);

    return NextResponse.json({
      ok: true,
      profile: persisted.profile ?? result.profile,
      saved: persisted.saved,
      source: persisted.source,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Profile creation failed",
      },
      { status: 400 },
    );
  }
}


export async function PATCH(request: Request) {
  try {
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) {
      return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });
    }

    const client = (await import("../../../lib/supabaseServer")).createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: false, reason: "Profile service is not configured." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const sanitized = sanitizeProfilePayload(body);
    if (!sanitized.displayName) {
      return NextResponse.json({ ok: false, reason: "Display name is required." }, { status: 400 });
    }

    const allowedVisibility = ["public", "private", "hidden"];
    if (sanitized.visibility && !allowedVisibility.includes(sanitized.visibility)) {
      return NextResponse.json({ ok: false, reason: "Invalid profile visibility." }, { status: 400 });
    }

    const update = {
      display_name: sanitized.displayName,
      bio: sanitized.bio ?? null,
      phone: sanitized.phone ?? null,
      country: sanitized.country ?? null,
      nationality: sanitized.nationality ?? null,
      location: sanitized.location ?? null,
      area: sanitized.area ?? null,
      category: sanitized.category ?? null,
      services: sanitized.services ?? [],
      content_categories: sanitized.contentCategories ?? [],
      age: sanitized.age ?? null,
      gender: sanitized.gender ?? null,
      pronouns: sanitized.pronouns ?? null,
      headline: sanitized.headline ?? null,
      languages: sanitized.languages ?? [],
      availability: sanitized.availability ?? null,
      timezone: sanitized.timezone ?? "Africa/Kampala",
      visibility: sanitized.visibility ?? "public",
      social_platforms: sanitized.socialPlatforms ?? {},
      contact_methods: sanitized.contactMethods ?? {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("profiles")
      .update(update)
      .eq("user_id", identity.userId)
      .select("id,user_id,display_name,bio,phone,country,nationality,location,area,category,services,content_categories,age,gender,pronouns,headline,languages,availability,timezone,visibility,social_platforms,contact_methods,tier,verification_status,profile_photo_id,account_status,created_at,updated_at")
      .maybeSingle();

    if (error) {
      if (error.code === "23505" && /profiles_phone_normalized_unique_idx|phone/i.test(error.message || "")) {
        return NextResponse.json({ ok: false, reason: "That phone number is already registered. Use a different phone number." }, { status: 409 });
      }
      return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ ok: false, reason: "Profile not found." }, { status: 404 });

    return NextResponse.json({ ok: true, saved: true, source: "supabase", profile: data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Profile update failed." }, { status: 400 });
  }
}
