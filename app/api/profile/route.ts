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
        "id, user_id, display_name, bio, phone, country, location, category, services, tier, verification_status, avatar_url, created_at, updated_at",
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
        location: data.location,
        category: data.category,
        services: Array.isArray(data.services) ? data.services : [],
        tier: data.tier,
        verificationStatus: data.verification_status,
        profilePhotoId: data.avatar_url,
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
      location: sanitized.location,
      category: sanitized.category,
    });

    if (!result.ok || !result.profile) {
      return NextResponse.json(
        { ok: false, reason: result.reason },
        { status: 400 },
      );
    }

    result.profile.services = sanitized.services;
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
