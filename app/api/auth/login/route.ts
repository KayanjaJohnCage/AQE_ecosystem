import { NextResponse } from "next/server";
import { createAnonSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, reason: "Email and password are required." },
        { status: 400 },
      );
    }

    const client = createAnonSupabaseClient();

    if (!client) {
      const response = NextResponse.json({
        ok: true,
        mode: "mock",
        user: { email, role: "customer" },
        session: {
          access_token: "mock-session-token",
          refresh_token: "mock-refresh-token",
        },
      });
      response.cookies.set("aqe-access-token", "mock-session-token", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return response;
    }

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, reason: error.message },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      mode: "supabase",
      user: data.user,
      session: data.session,
    });
    response.cookies.set("aqe-access-token", data.session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.session.expires_in ?? 3600,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Login failed",
      },
      { status: 400 },
    );
  }
}
