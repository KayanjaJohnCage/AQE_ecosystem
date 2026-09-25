import { NextResponse } from "next/server";
import { createAnonSupabaseClient, createServerSupabaseClient } from "../../../../lib/supabaseServer";
import { normalizeRole } from "../../../../lib/aqe/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ ok: false, reason: "AQE email and password are required." }, { status: 400 });
    }

    const anon = createAnonSupabaseClient();
    if (!anon) {
      return NextResponse.json({ ok: false, reason: "Manager authentication is not configured." }, { status: 503 });
    }

    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      return NextResponse.json({ ok: false, reason: "Invalid manager credentials." }, { status: 401 });
    }

    const server = createServerSupabaseClient();
    if (!server) {
      return NextResponse.json({ ok: false, reason: "Manager authentication is not configured." }, { status: 503 });
    }

    const { data: profile } = await server
      .from("profiles")
      .select("role,email")
      .eq("user_id", data.user.id)
      .maybeSingle();

    const role = normalizeRole(profile?.role);
    if (role !== "manager" && role !== "admin") {
      await anon.auth.signOut();
      return NextResponse.json({ ok: false, reason: "This account is not authorized for the AQE management console." }, { status: 403 });
    }

    const response = NextResponse.json({
      ok: true,
      role,
      user: { id: data.user.id, email: data.user.email ?? profile?.email ?? email },
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
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Manager authentication failed." }, { status: 400 });
  }
}
