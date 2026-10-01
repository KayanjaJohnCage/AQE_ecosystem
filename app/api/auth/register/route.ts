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
    const nationality = String(body.nationality ?? "").trim();
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
    const profilePhotoDataUrl = String(body.profilePhotoDataUrl ?? "").trim();

    if (!Number.isInteger(ageValue) || ageValue < 18 || ageValue > 100) {
      return NextResponse.json(
        { ok: false, reason: "A valid age of 18 to 100 is required." },
        { status: 400 },
      );
    }

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
        nationality,
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

    const normalizedPhone = phone.replace(/[^0-9]/g, "");
    if (normalizedPhone) {
      const duplicatePhone = await client
        .from("profiles")
        .select("user_id,phone")
        .neq("phone", "")
        .not("phone", "is", null)
        .limit(1000);
      const duplicate = (duplicatePhone.data ?? []).some(
        (row) => String(row.user_id) !== "" && normalizedPhone === String(row.phone ?? "").replace(/[^0-9]/g, ""),
      );
      if (duplicate) {
        return NextResponse.json(
          { ok: false, reason: "That phone number is already registered. Use a different phone number." },
          { status: 409 },
        );
      }
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

    // Supabase Auth enforces email uniqueness, but checking the server-side Auth index
    // first gives the customer a deterministic duplicate-email message instead of
    // relying on the provider's sign-up response behavior.
    const normalizedEmail = email.toLowerCase();
    try {
      for (let page = 1; page <= 20; page += 1) {
        const listed = await client.auth.admin.listUsers({ page, perPage: 1000 });
        if (listed.error) break;
        const duplicateEmail = (listed.data.users ?? []).some(
          (user) =>
            user.id !== undefined &&
            String(user.email ?? "").trim().toLowerCase() === normalizedEmail,
        );
        if (duplicateEmail) {
          return NextResponse.json(
            { ok: false, reason: "That email address is already registered. Use a different email address or sign in." },
            { status: 409 },
          );
        }
        if ((listed.data.users ?? []).length < 1000) break;
      }
    } catch (emailLookupError) {
      console.warn("[AQE registration] duplicate-email precheck unavailable", emailLookupError);
    }

    const authClient = createAnonSupabaseClient();
    if (!authClient) {
      return NextResponse.json(
        { ok: false, reason: "Authentication service is not configured." },
        { status: 503 },
      );
    }

    // Production confirmations use the official site. Preview deployments use
    // Vercel's deployment URL so preview tests do not redirect into production.
    // Supabase must allow the production URL and a Vercel preview wildcard.
    const configuredSiteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    const previewHost =
      process.env.VERCEL_ENV === "preview"
        ? String(process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL || "").trim()
        : "";
    const siteUrl = previewHost
      ? `https://${previewHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
      : configuredSiteUrl;
    const emailRedirectTo = siteUrl ? siteUrl + "/auth/confirmed" : undefined;
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          phone,
          role: "customer",
        },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error || !data.user) {
      console.error("[AQE registration] Supabase signUp failed", {
        email,
        error: error?.message ?? "No user returned",
        status: error?.status ?? null,
        code: error?.code ?? null,
        userId: data.user?.id ?? null,
      });

      /* Supabase may create the Auth row before a confirmation-email transport
         failure is returned. Remove that orphan immediately so a retry cannot
         create a duplicate account. */
      if (error && data.user?.id) {
        const cleanup = await client.auth.admin.deleteUser(data.user.id);
        if (cleanup.error) {
          console.error("[AQE registration] Auth cleanup after signUp failure failed", {
            userId: data.user.id,
            error: cleanup.error.message,
          });
        }
      }

      const authMessage = String(error?.message ?? "");
      const confirmationEmailFailure = /error sending confirmation email|confirmation email/i.test(authMessage);
      return NextResponse.json(
        {
          ok: false,
          reason: confirmationEmailFailure
            ? "AQE could not send the email confirmation message. The account was not completed. Configure Supabase Auth custom SMTP and verify the AQE Site URL/redirect URL, then try registration again."
            : (
              error?.message ??
              "Unable to create the account. Check the Supabase Auth configuration and try again."
            ),
          code: confirmationEmailFailure ? "AUTH_EMAIL_DELIVERY_UNAVAILABLE" : (error?.code ?? null),
        },
        { status: 400 },
      );
    }

    const profileRecord = createProfileRecord({
      userId: data.user?.id ?? `user-${Date.now()}`,
      displayName,
      phone,
      country,
      nationality,
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
      timezone: String(body.timezone ?? "Africa/Kampala").trim(),
      visibility: String(body.visibility ?? "public").trim(),
      socialPlatforms,
      contactMethods,
      tier: "basic",
      verificationStatus: "pending",
    });

    const persisted = await persistProfileRecord(profileRecord.profile!);

    if (!persisted.ok || !persisted.saved) {
      // A unique phone constraint is the final race-safe duplicate check.
      if (/profiles_phone_normalized_unique_idx|duplicate key.*phone/i.test(persisted.reason ?? "")) {
        if (data.user?.id) await client.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { ok:false, reason:"That phone number is already registered. Use a different phone number." },
          { status:409 },
        );
      }

      // Do not leave an Auth account behind when its application profile
      // could not be persisted. This keeps Auth and public.profiles in sync.
      if (data.user?.id) {
        const cleanup = await client.auth.admin.deleteUser(data.user.id);
        if (cleanup.error) {
          console.error("[AQE registration] profile persistence failed and Auth cleanup failed", {
            userId: data.user.id,
            error: cleanup.error.message,
            profileReason: persisted.reason ?? null,
          });
        }
      }

      return NextResponse.json(
        {
          ok: false,
          reason:
            persisted.reason ??
            "Account could not be completed because the customer profile was not saved.",
        },
        { status: 500 },
      );
    }

    if (data.user?.id && profilePhotoDataUrl) {
      const match = profilePhotoDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
      if (!match) {
        await client.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { ok: false, reason: "The profile photo format is invalid. Use JPG, PNG, or WEBP." },
          { status: 400 },
        );
      }

      const contentType = match[1].toLowerCase();
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length || buffer.length > 2.5 * 1024 * 1024) {
        await client.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { ok: false, reason: "The profile photo must be 2.5 MB or smaller." },
          { status: 400 },
        );
      }

      const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
      const objectPath = `${data.user.id}/image/${Date.now()}-profile.${extension}`;
      const uploaded = await client.storage
        .from("profile-media")
        .upload(objectPath, buffer, { contentType, upsert: false });

      if (uploaded.error) {
        await client.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { ok: false, reason: uploaded.error.message },
          { status: 500 },
        );
      }

      const media = await client
        .from("profile_media")
        .insert({
          owner_user_id: data.user.id,
          storage_path: objectPath,
          media_type: "image",
          mime_type: contentType,
          file_size: buffer.length,
          visibility: "public",
          moderation_status: "approved",
          is_profile_photo: true,
          content_access: "public",
        })
        .select("id")
        .single();

      if (media.error || !media.data) {
        await client.storage.from("profile-media").remove([objectPath]);
        await client.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { ok: false, reason: media.error?.message ?? "Profile photo could not be registered." },
          { status: 500 },
        );
      }

      const photoUpdate = await client
        .from("profiles")
        .update({
          profile_photo_id: media.data.id,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", data.user.id);

      if (photoUpdate.error) {
        await client.storage.from("profile-media").remove([objectPath]);
        await client.from("profile_media").delete().eq("id", media.data.id);
        await client.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { ok: false, reason: photoUpdate.error.message },
          { status: 500 },
        );
      }
    }

    if (data.user?.id) {
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

    const signedIn = { data: { session: data.session } };

    const response = NextResponse.json({
      ok: true,
      mode: "supabase",
      user: data.user,
      profile: persisted.profile ?? profileRecord.profile,
      session: signedIn.data.session,
      tier: "basic",
      requestedTier,
      upgradeRequired: requestedTier !== "basic",
      emailVerificationRequired: !signedIn.data.session,
      emailVerificationSent: !signedIn.data.session,
    });

    if (signedIn.data.session?.access_token) {
      response.cookies.set("aqe-access-token", signedIn.data.session.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: signedIn.data.session.expires_in ?? 3600,
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