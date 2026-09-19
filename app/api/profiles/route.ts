import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({ ok: true, source: "demo", profiles: [] });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim();
    const location = url.searchParams.get("location")?.trim();

    let profileQuery = client
      .from("profiles")
      .select(
        "id, user_id, display_name, bio, country, location, category, tier, verification_status",
      )
      .order("updated_at", { ascending: false })
      .limit(50);

    if (query) {
      profileQuery = profileQuery.or(
        `display_name.ilike.%${query}%,category.ilike.%${query}%,bio.ilike.%${query}%`,
      );
    }
    if (location)
      profileQuery = profileQuery.ilike("location", `%${location}%`);

    const { data, error } = await profileQuery;
    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      profiles: (data ?? []).map((profile) => ({
        id: profile.id,
        userId: profile.user_id,
        name: profile.display_name || "AQE Member",
        city: profile.location || profile.country || "East Africa",
        tag: profile.category || "Community member",
        status:
          profile.verification_status === "approved"
            ? "Verified member"
            : "Profile pending",
        tier: profile.tier || "basic",
        bio:
          profile.bio || "Open to meaningful connections and collaborations.",
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error ? error.message : "Profiles unavailable.",
      },
      { status: 500 },
    );
  }
}
