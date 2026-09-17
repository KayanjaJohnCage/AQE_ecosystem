import { NextResponse } from "next/server";
import {
  createProfileRecord,
  persistProfileRecord,
} from "../../../../lib/aqe/profile";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");
    const displayName =
      String(body.displayName ?? body.name ?? "").trim() || email.split("@")[0];

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
        tier: "basic",
        verificationStatus: "pending",
      });

      const persisted = await persistProfileRecord(profileRecord.profile!);

      return NextResponse.json({
        ok: true,
        mode: "mock",
        user: { email, role: "customer" },
        profile: persisted.profile ?? profileRecord.profile,
      });
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
      tier: "basic",
      verificationStatus: "pending",
    });

    const persisted = await persistProfileRecord(profileRecord.profile!);

    return NextResponse.json({
      ok: true,
      mode: "supabase",
      user: data.user,
      profile: persisted.profile ?? profileRecord.profile,
    });
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
