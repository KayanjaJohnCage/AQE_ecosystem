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
      "id,user_id,display_name,bio,country,location,area,category,content_categories,services,age,gender,headline,languages,pronouns,availability,visibility,social_platforms,contact_methods,tier,verification_status,avatar_url"
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

    const profiles = data ?? [];
    const ownerIds = profiles.map((profile) => profile.user_id);

    const { data: mediaRows } = ownerIds.length
      ? await client
          .from("profile_media")
          .select(
            "id,owner_user_id,storage_path,media_type,mime_type,is_profile_photo,created_at",
          )
          .in("owner_user_id", ownerIds)
          .eq("visibility", "public")
          .eq("moderation_status", "approved")
          .order("created_at", { ascending: false })
      : { data: [] };

    const mediaByOwner = new Map<string, Array<Record<string, unknown>>>();
    for (const media of mediaRows ?? []) {
      const signed = await client.storage
        .from("profile-media")
        .createSignedUrl(media.storage_path, 3600);

      if (!signed.data?.signedUrl) continue;

      const item = {
        id: media.id,
        type: media.media_type,
        url: signed.data.signedUrl,
        mimeType: media.mime_type,
        isProfilePhoto: Boolean(media.is_profile_photo),
      };

      const existing = mediaByOwner.get(media.owner_user_id) ?? [];
      existing.push(item);
      mediaByOwner.set(media.owner_user_id, existing);
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      profiles: profiles.map((profile) => ({

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
        avatarUrl:
          (mediaByOwner.get(profile.user_id) ?? []).find(
            (media) => media.isProfilePhoto,
          )?.url || profile.avatar_url || "",
        media: mediaByOwner.get(profile.user_id) ?? [],
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Profiles unavailable." }, { status: 500 });
  }
}