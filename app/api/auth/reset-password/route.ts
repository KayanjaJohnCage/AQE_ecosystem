import { NextResponse } from "next/server";
import { createAnonSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ ok: false, reason: "Email is required." }, { status: 400 });
    const client = createAnonSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Authentication service is not configured." }, { status: 503 });
    const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl ? `${siteUrl}/auth/reset-password` : undefined,
    });
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Password reset request failed." }, { status: 400 });
  }
}
