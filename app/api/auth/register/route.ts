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

    const cleanupFailedRegistration = async (userId: string, storagePath?: string) => {
      if (storagePath) {
        const storageCleanup = await client.storage.from("profile-media").remove([storagePath]);
        if (storageCleanup.error) {
          console.error("[AQE registration] failed to remove profile-media object", { userId, storagePath, error: storageCleanup.error.message });
        }
      }
      const mediaCleanup = await client.from("profile_media").delete().eq("owner_user_id", userId);
      if (mediaCleanup.error) {
        console.error("[AQE registration] failed to remove profile_media rows", { userId, error: mediaCleanup.error.message });
      }
      const profileCleanup = await client.from("profiles").delete().eq("user_id", userId);
      if (profileCleanup.error) {
        console.error("[AQE registration] failed to remove profile row", { userId, error: profileCleanup.error.message });
      }
      const authCleanup = await client.auth.admin.deleteUser(userId);
      if (authCleanup.error) {
        console.error("[AQE registration] failed to remove Auth user after registration rollback", { userId, error: authCleanup.error.message });
      }
    };


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

    // Customer registration is completed server-side with email_confirm=true.
    // AQE account verification is handled by the profile verification workflow;
    // registration must not depend on Supabase's confirmation-email transport.
    const authClient = createAnonSupabaseClient();
    if (!authClient) {
      return NextResponse.json(
        { ok: false, reason: "Authentication service is not configured." },
        { status: 503 },
      );
    }

    const created = await client.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        phone,
        role: "customer",
      },
    });

    if (created.error || !created.data.user) {
      console.error("[AQE registration] Supabase admin user creation failed", {
        email: normalizedEmail,
        error: created.error?.message ?? "No user returned",
        code: created.error?.code ?? null,
      });
      return NextResponse.json(
        {
          ok: false,
          reason: created.error?.message ?? "Unable to create the account.",
          code: created.error?.code ?? null,
        },
        { status: 400 },
      );
    }

    const data = { user: created.data.user, session: null };

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
        if (data.user?.id) await cleanupFailedRegistration(data.user.id);
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
        await cleanupFailedRegistration(data.user.id);
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
        await cleanupFailedRegistration(data.user.id, objectPath);
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
        await cleanupFailedRegistration(data.user.id, objectPath);
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
        await cleanupFailedRegistration(data.user.id, objectPath);
        return NextResponse.json(
          { ok: false, reason: photoUpdate.error.message },
          { status: 500 },
        );
      }
    }

    if (data.user?.id) {
      const generatedReferralCode = `AQE-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      if (referredBy === data.user.id) {
        await cleanupFailedRegistration(data.user.id);
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
        await cleanupFailedRegistration(data.user.id);
        return NextResponse.json(
          { ok: false, reason: referralUpdate.error.message },
          { status: 500 },
        );
      }
    }

    const signedIn = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signedIn.error || !signedIn.data.session) {
      console.error("[AQE registration] account created but automatic sign-in failed", {
        userId: data.user?.id ?? null,
        error: signedIn.error?.message ?? "No session returned",
      });
      return NextResponse.json({
        ok: true,
        mode: "supabase",
        user: data.user,
        profile: persisted.profile ?? profileRecord.profile,
        session: null,
        tier: "basic",
        requestedTier,
        upgradeRequired: requestedTier !== "basic",
        emailVerificationRequired: false,
        emailVerificationSent: false,
        loginRequired: true,
        message: "Account created successfully. Sign in to continue.",
      });
    }

    const response = NextResponse.json({
      ok: true,
      mode: "supabase",
      user: data.user,
      profile: persisted.profile ?? profileRecord.profile,
      session: signedIn.data.session,
      tier: "basic",
      requestedTier,
      upgradeRequired: requestedTier !== "basic",
      emailVerificationRequired: false,
      emailVerificationSent: false,
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