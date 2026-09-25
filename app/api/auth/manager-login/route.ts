import { NextResponse } from "next/server";
import { createAnonSupabaseClient, createServerSupabaseClient } from "../../../../lib/supabaseServer";
import { createManagerGateToken } from "../../../../lib/aqe/auth";

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = String(body.password ?? "");
    if (!password) {
      return NextResponse.json({ ok: false, reason: "Manager password is required." }, { status: 400 });
    }

    const googleToken = readCookie(request, "aqe-google-verified");
    if (!googleToken) {
      return NextResponse.json({ ok: false, reason: "Verify the authorized AQE Google account first." }, { status: 403 });
    }

    const anon = createAnonSupabaseClient();
    if (!anon) {
      return NextResponse.json({ ok: false, reason: "Manager authentication is not configured." }, { status: 503 });
    }

    const googleUser = await anon.auth.getUser(googleToken);
    if (googleUser.error || !googleUser.data.user) {
      return NextResponse.json({ ok: false, reason: "Google verification expired. Sign in with Google again." }, { status: 401 });
    }

    const expectedEmail = String(process.env.AQE_MANAGER_GOOGLE_EMAIL ?? "").trim().toLowerCase();
    const expectedSub = String(process.env.AQE_MANAGER_GOOGLE_SUB ?? "").trim();
    const identity = (googleUser.data.user.identities ?? []).find((item) => item.provider === "google");
    if (
      !expectedEmail ||
      !expectedSub ||
      String(googleUser.data.user.email ?? "").trim().toLowerCase() !== expectedEmail ||
      String(identity?.identity_data?.sub ?? "").trim() !== expectedSub
    ) {
      return NextResponse.json({ ok: false, reason: "This Google account is not authorized for AQE Manager Control." }, { status: 403 });
    }

    const email = String(googleUser.data.user.email ?? expectedEmail).trim().toLowerCase();
    const passwordLogin = await anon.auth.signInWithPassword({ email, password });
    if (passwordLogin.error || !passwordLogin.data.user || !passwordLogin.data.session) {
      return NextResponse.json({ ok: false, reason: "Invalid manager password." }, { status: 401 });
    }

    if (passwordLogin.data.user.id !== googleUser.data.user.id) {
      return NextResponse.json({ ok: false, reason: "Google identity and password account do not match." }, { status: 403 });
    }

    const server = createServerSupabaseClient();
    if (!server) {
      return NextResponse.json({ ok: false, reason: "Manager authentication is not configured." }, { status: 503 });
    }

    const { data: profile } = await server
      .from("profiles")
      .select("role,email")
      .eq("user_id", passwordLogin.data.user.id)
      .maybeSingle();

    const role = String(profile?.role ?? "").toLowerCase();
    if (!["manager", "admin"].includes(role)) {
      return NextResponse.json({ ok: false, reason: "This account is not authorized for the AQE management console." }, { status: 403 });
    }

    const response = NextResponse.json({
      ok: true,
      role,
      user: { id: passwordLogin.data.user.id, email },
    });

    response.cookies.set("aqe-access-token", passwordLogin.data.session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: passwordLogin.data.session.expires_in ?? 3600,
    });

    response.cookies.set("aqe-manager-session", createManagerGateToken(passwordLogin.data.user.id), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 1800,
    });

    response.cookies.set("aqe-google-verified", "", {
      httpOnly: true,
      expires: new Date(0),
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Manager authentication failed." },
      { status: 400 },
    );
  }
}
