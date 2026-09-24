import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeTier } from "../../../../lib/aqe/auth";
import {
  createProfileRecord,
  persistProfileRecord,
} from "../../../../lib/aqe/profile";
import {
  createAnonSupabaseClient,
  createServerSupabaseClient,
} from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const displayName =
      String(body.displayName ?? body.name ?? "").trim() || email.split("@")[0];
    const referralCode = String(body.referralCode ?? "")
      .trim()
      .toUpperCase();
    const phone = String(body.phone ?? "").trim();
    const country = String(body.country ?? "").trim();
    const city = String(body.city ?? "").trim();
    const bio = String(body.bio ?? "").trim();
    const category = String(body.category ?? "client").trim();
    const services = Array.isArray(body.services) ? body.services.filter((item: unknown) => typeof item === "string").map((item: string) => item.trim()).filter(Boolean) : [];
    const contentCategories = Array.isArray(body.contentCategories) ? body.contentCategories.filter((item: unknown) => typeof item === "string").map((item: string) => item.trim().toLowerCase()).filter(Boolean) : [];
    const socialHandle = String(body.socialHandle ?? "").trim();
    const contactPreference = String(body.contactPreference ?? "in_app").trim();
    const socialPlatforms = body.socialPlatforms && typeof body.socialPlatforms === "object" ? body.socialPlatforms : (socialHandle ? { primary: socialHandle } : {});
    const contactMethods = body.contactMethods && typeof body.contactMethods === "object" ? body.contactMethods : (contactPreference ? { preference: contactPreference } : {});
    const ageValue = Number(body.age);
    const requestedTier = normalizeTier(
      typeof body.requestedTier === "string" ? body.requestedTier : "basic",
    );

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, reason: "Email and password are required." },
        { status: 400 },
      );
    }

    const client = createServerSupabaseClient();

    if (!client) {
      const profileRecord = createProfileRecord({
        userId: `demo-${Date.now()}`,
        displayName,
        phone,
        country,
        location: city,
        bio,
        category,
        services,
        contentCategories,
        age: Number.isFinite(ageValue) ? ageValue : undefined,
        gender: String(body.gender ?? "").trim(),
        pronouns: String(body.pronouns ?? "").trim(),
        headline: String(body.headline ?? "").trim(),
        languages: Array.isArray(body.languages) ? body.languages.filter((item: unknown) => typeof item === "string") : String(body.languages ?? "").split(",").map((item: string) => item.trim()).filter(Boolean),
        area: String(body.area ?? "").trim(),
        availability: String(body.availability ?? "").trim(),
        visibility: String(body.visibility ?? "public").trim(),
        socialPlatforms,
        contactMethods,
        tier: "basic",
        verificationStatus: "pending",
      });

      const persisted = await persistProfileRecord(profileRecord.profile!);

      return NextResponse.json({
        ok: true,
        mode: "mock",
        user: { email, role: "customer" },
        profile: persisted.profile ?? profileRecord.profile,
        tier: "basic",
        requestedTier,
        upgradeRequired: requestedTier !== "basic",
      });
    }

    let referredBy: string | null = null;
    if (referralCode) {
      const referrer = await client
        .from("profiles")
        .select("user_id")
        .eq("referral_code", referralCode)
        .maybeSingle();
      if (referrer.error || !referrer.data) {
        return NextResponse.json(
          { ok: false, reason: "Referral link is invalid or expired." },
          { status: 400 },
        );
      }
      referredBy = referrer.data.user_id;
    }

    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        role: "customer",
      },
    });

    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 400 },
      );
    }

    const profileRecord = createProfileRecord({
      userId: data.user?.id ?? `user-${Date.now()}`,
      displayName,
      phone,
      country,
      location: city,
      bio,
      category,
      services,
      contentCategories,
      age: Number.isFinite(ageValue) ? ageValue : undefined,
      gender: String(body.gender ?? "").trim(),
      pronouns: String(body.pronouns ?? "").trim(),
      headline: String(body.headline ?? "").trim(),
      languages: Array.isArray(body.languages) ? body.languages.filter((item: unknown) => typeof item === "string") : String(body.languages ?? "").split(",").map((item: string) => item.trim()).filter(Boolean),
      area: String(body.area ?? "").trim(),
      availability: String(body.availability ?? "").trim(),
      visibility: String(body.visibility ?? "public").trim(),
      socialPlatforms,
      contactMethods,
      tier: "basic",
      verificationStatus: "pending",
    });

    const persisted = await persistProfileRecord(profileRecord.profile!);

    if (persisted.ok && data.user?.id) {
      const generatedReferralCode = `AQE-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      if (referredBy === data.user.id) {
        return NextResponse.json(
          { ok: false, reason: "You cannot use your own referral link." },
          { status: 400 },
        );
      }

      const referralUpdate = await client
        .from("profiles")
        .update({
          referral_code: generatedReferralCode,
          referred_by: referredBy,
        })
        .eq("user_id", data.user.id);
      if (referralUpdate.error) {
        return NextResponse.json(
          { ok: false, reason: referralUpdate.error.message },
          { status: 500 },
        );
      }
    }

    const authClient = createAnonSupabaseClient();
    const { data: signedIn } = authClient
      ? await authClient.auth.signInWithPassword({ email, password })
      : { data: { session: null } };

    const response = NextResponse.json({
      ok: true,
      mode: "supabase",
      user: data.user,
      profile: persisted.profile ?? profileRecord.profile,
      session: signedIn.session,
      tier: "basic",
      requestedTier,
      upgradeRequired: requestedTier !== "basic",
    });

    if (signedIn.session?.access_token) {
      response.cookies.set("aqe-access-token", signedIn.session.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: signedIn.session.expires_in ?? 3600,
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Registration failed",
      },
      { status: 400 },
    );
  }
}
