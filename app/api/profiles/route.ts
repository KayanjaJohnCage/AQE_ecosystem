import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, source: "supabase", profiles: [] });

    const session = await resolveAuthenticatedSession(request);
    const viewerUserId = session.authenticated ? session.userId : undefined;

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

    const { data: boostRows } = ownerIds.length
      ? await client
          .from("profile_boosts")
          .select("user_id,expires_at,label")
          .in("user_id", ownerIds)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: false })
      : { data: [] };

    const boostByOwner = new Map<string, { expiresAt: string; label: string }>();
    for (const boost of boostRows ?? []) {
      if (!boostByOwner.has(boost.user_id)) {
        boostByOwner.set(boost.user_id, {
          expiresAt: boost.expires_at,
          label: boost.label || "Boosted profile",
        });
      }
    }

    const { data: mediaRows } = ownerIds.length
      ? await client
          .from("profile_media")
          .select(
            "id,owner_user_id,storage_path,media_type,mime_type,is_profile_photo,content_access,created_at",
          )
          .in("owner_user_id", ownerIds)
          .eq("visibility", "public")
          .eq("moderation_status", "approved")
          .order("created_at", { ascending: false })
      : { data: [] };

    const vipOwnerIds = [...new Set((mediaRows ?? [])
      .filter((media) => media.content_access === "subscribers_only")
      .map((media) => media.owner_user_id))];

    const subscribedVipIds = new Set<string>();
    if (viewerUserId && vipOwnerIds.length) {
      const { data: subscriptions } = await client
        .from("vip_content_subscriptions")
        .select("vip_user_id")
        .eq("subscriber_user_id", viewerUserId)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .in("vip_user_id", vipOwnerIds);
      for (const subscription of subscriptions ?? []) subscribedVipIds.add(subscription.vip_user_id);
    }

    const mediaByOwner = new Map<string, Array<Record<string, unknown>>>();
    for (const media of mediaRows ?? []) {
      const locked = media.content_access === "subscribers_only" &&
        media.owner_user_id !== viewerUserId &&
        !subscribedVipIds.has(media.owner_user_id);

      let signedUrl = "";
      if (!locked) {
        const signed = await client.storage
          .from("profile-media")
          .createSignedUrl(media.storage_path, 3600);
        signedUrl = signed.data?.signedUrl ?? "";
      }

      const item = {
        id: media.id,
        type: media.media_type,
        url: signedUrl,
        mimeType: media.mime_type,
        isProfilePhoto: Boolean(media.is_profile_photo),
        contentAccess: media.content_access || "public",
        locked,
        subscriptionRequired: media.content_access === "subscribers_only",
      };

      const existing = mediaByOwner.get(media.owner_user_id) ?? [];
      existing.push(item);
      mediaByOwner.set(media.owner_user_id, existing);
    }

    const vipOwnerIdsForSettings = profiles.filter((profile) => profile.tier === "vip").map((profile) => profile.user_id);
    const { data: vipSettingsRows } = vipOwnerIdsForSettings.length
      ? await client.from("vip_content_settings").select("vip_user_id,enabled,monthly_price,currency,title,description").in("vip_user_id", vipOwnerIdsForSettings)
      : { data: [] };
    const vipSettingsByOwner = new Map<string, { enabled: boolean; monthlyPrice: number; currency: string; title: string; description: string | null }>();
    for (const row of vipSettingsRows ?? []) {
      vipSettingsByOwner.set(row.vip_user_id, {
        enabled: Boolean(row.enabled),
        monthlyPrice: Number(row.monthly_price),
        currency: row.currency,
        title: row.title,
        description: row.description,
      });
    }

    const orderedProfiles = [...profiles].sort((a, b) => {
      const aBoost = boostByOwner.get(a.user_id);
      const bBoost = boostByOwner.get(b.user_id);
      if (Boolean(aBoost) !== Boolean(bBoost)) return aBoost ? -1 : 1;
      if (aBoost && bBoost) {
        return new Date(bBoost.expiresAt).getTime() - new Date(aBoost.expiresAt).getTime();
      }
      return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
    });

    return NextResponse.json({
      ok: true,
      source: "supabase",
      profiles: orderedProfiles.map((profile) => ({

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
        boosted: boostByOwner.has(profile.user_id),
        boostExpiresAt: boostByOwner.get(profile.user_id)?.expiresAt || null,
        boostLabel: boostByOwner.get(profile.user_id)?.label || "",
        bio: profile.bio || "",
        avatarUrl:
          (mediaByOwner.get(profile.user_id) ?? []).find(
            (media) => media.isProfilePhoto,
          )?.url || profile.avatar_url || "",
        media: mediaByOwner.get(profile.user_id) ?? [],
        vipContent: profile.tier === "vip"
          ? {
              ...(vipSettingsByOwner.get(profile.user_id) ?? {
                enabled: false,
                monthlyPrice: 0,
                currency: "UGX",
                title: "VIP Content",
                description: null,
              }),
              subscribed: subscribedVipIds.has(profile.user_id),
            }
          : null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Profiles unavailable." }, { status: 500 });
  }
}