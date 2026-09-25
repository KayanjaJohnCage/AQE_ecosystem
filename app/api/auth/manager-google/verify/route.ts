import { NextResponse } from "next/server";
import { createAnonSupabaseClient, createServerSupabaseClient } from "../../../../../lib/supabaseServer";

function isAuthorizedGoogleIdentity(user: {
  email?: string | null;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null;
}) {
  const expectedEmail = String(process.env.AQE_MANAGER_GOOGLE_EMAIL ?? "").trim().toLowerCase();
  const expectedSub = String(process.env.AQE_MANAGER_GOOGLE_SUB ?? "").trim();
  if (!expectedEmail || !expectedSub) return false;
  if (String(user.email ?? "").trim().toLowerCase() !== expectedEmail) return false;
  const identity = (user.identities ?? []).find((item) => item.provider === "google");
  return String(identity?.identity_data?.sub ?? "").trim() === expectedSub;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = String(body.accessToken ?? "").trim();
    if (!accessToken) return NextResponse.json({ ok: false, reason: "Google verification token is required." }, { status: 400 });
    const anon = createAnonSupabaseClient();
    if (!anon) return NextResponse.json({ ok: false, reason: "Manager Google authentication is not configured." }, { status: 503 });
    const { data, error } = await anon.auth.getUser(accessToken);
    if (error || !data.user) return NextResponse.json({ ok: false, reason: "Google authentication could not be verified." }, { status: 401 });
    if (!isAuthorizedGoogleIdentity(data.user)) return NextResponse.json({ ok: false, reason: "This Google account is not authorized for AQE Manager Control." }, { status: 403 });

    const server = createServerSupabaseClient();
    if (!server) return NextResponse.json({ ok: false, reason: "Manager authentication is not configured." }, { status: 503 });
    const { data: profile } = await server.from("profiles").select("role,email").eq("user_id", data.user.id).maybeSingle();
    if (!["manager", "admin"].includes(String(profile?.role ?? "").toLowerCase())) {
      return NextResponse.json({ ok: false, reason: "The authorized Google account is not assigned a manager role." }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true, email: data.user.email ?? profile?.email ?? "", userId: data.user.id });
    response.cookies.set("aqe-google-verified", accessToken, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Google verification failed." }, { status: 400 });
  }
}
