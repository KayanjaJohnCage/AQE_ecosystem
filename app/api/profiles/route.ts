import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, source: "supabase", profiles: [] });

    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim();
    const category = url.searchParams.get("category")?.trim().toLowerCase();
    const service = url.searchParams.get("service")?.trim().toLowerCase();
    const location = url.searchParams.get("location")?.trim();
    const gender = url.searchParams.get("gender")?.trim().toLowerCase();
    const ageMin = Number(url.searchParams.get("ageMin") || 0);
    const ageMax = Number(url.searchParams.get("ageMax") || 0);

    let profileQuery = client.from("profiles").select(
      "id,user_id,display_name,bio,country,location,area,category,content_categories,services,age,gender,headline,languages,pronouns,availability,visibility,social_platforms,contact_methods,tier,verification_status"
    ).eq("visibility", "public").order("updated_at", { ascending: false }).limit(100);

    if (query) profileQuery = profileQuery.or(
      "display_name.ilike.%" + query + "%,category.ilike.%" + query + "%,headline.ilike.%" + query + "%,bio.ilike.%" + query + "%,location.ilike.%" + query + "%"
    );
    if (category) profileQuery = profileQuery.contains("content_categories", [category]);
    if (service) profileQuery = profileQuery.contains("services", [service]);
    if (location) profileQuery = profileQuery.ilike("location", "%" + location + "%");
    if (gender) profileQuery = profileQuery.ilike("gender", gender);
    if (ageMin >= 18) profileQuery = profileQuery.gte("age", ageMin);
    if (ageMax >= 18) profileQuery = profileQuery.lte("age", ageMax);

    const { data, error } = await profileQuery;
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      source: "supabase",
      profiles: (data ?? []).map((profile) => ({
        id: profile.id,
        userId: profile.user_id,
        name: profile.display_name || "AQE Member",
        city: profile.location || profile.country || "East Africa",
        location: profile.location || profile.country || "",
        area: profile.area || "",
        tag: profile.category || "Community member",
        contentCategories: Array.isArray(profile.content_categories) ? profile.content_categories : [],
        services: Array.isArray(profile.services) ? profile.services : [],
        age: profile.age ?? null,
        gender: profile.gender || "",
        headline: profile.headline || "",
        languages: Array.isArray(profile.languages) ? profile.languages : [],
        pronouns: profile.pronouns || "",
        availability: profile.availability || "",
        visibility: profile.visibility || "public",
        socialPlatforms: profile.social_platforms || {},
        contactMethods: profile.contact_methods || {},
        status: profile.verification_status === "approved" ? "Verified member" : "Profile pending",
        tier: profile.tier || "basic",
        bio: profile.bio || "",
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Profiles unavailable." }, { status: 500 });
  }
}