import { NextResponse } from "next/server";
import { createAnonSupabaseClient, createServerSupabaseClient } from "../../../../lib/supabaseServer";

function phoneVariants(value: string) {
  const cleaned = value.trim().replace(/[\s().-]/g, "");
  const variants = new Set<string>([cleaned]);
  if (cleaned.startsWith("+256") && cleaned.length >= 12) {
    variants.add("0" + cleaned.slice(4));
    variants.add(cleaned.slice(1));
  } else if (cleaned.startsWith("256") && cleaned.length >= 11) {
    variants.add("+" + cleaned);
    variants.add("0" + cleaned.slice(3));
  } else if (cleaned.startsWith("0") && cleaned.length >= 10) {
    variants.add("+256" + cleaned.slice(1));
    variants.add("256" + cleaned.slice(1));
  }
  return Array.from(variants);
}

async function resolveLoginEmail(identifier: string) {
  if (identifier.includes("@")) return identifier.toLowerCase();
  const server = createServerSupabaseClient();
  if (!server) return null;
  const { data, error } = await server.from("profiles").select("user_id, phone").in("phone", phoneVariants(identifier)).limit(2);
  if (error || !data || data.length !== 1) return null;
  const user = await server.auth.admin.getUserById(data[0].user_id);
  if (user.error || !user.data.user?.email) return null;
  return user.data.user.email.toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body.identifier ?? body.email ?? body.phone ?? "").trim();
    const password = String(body.password ?? "");
    if (!identifier || !password) {
      return NextResponse.json({ ok: false, reason: "Email/phone and password are required." }, { status: 400 });
    }

    const client = createAnonSupabaseClient();
    if (!client) {
      if (!identifier.includes("@")) {
        return NextResponse.json({ ok: false, reason: "Phone login is not configured yet." }, { status: 503 });
      }
      const response = NextResponse.json({
        ok: true,
        mode: "mock",
        user: { email: identifier.toLowerCase(), role: "customer" },
        session: { access_token: "mock-session-token", refresh_token: "mock-refresh-token" },
      });
      response.cookies.set("aqe-access-token", "mock-session-token", {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
      });
      return response;
    }

    const email = await resolveLoginEmail(identifier);
    if (!email) {
      return NextResponse.json({ ok: false, reason: "Invalid email/phone or password." }, { status: 401 });
    }

    const server = createServerSupabaseClient();
    if (server) {
      const authLookup = await server.auth.admin.getUserByEmail(email);
      const targetUserId = authLookup.data.user?.id;
      if (targetUserId) {
        const profile = await server.from("profiles").select("account_status").eq("user_id", targetUserId).maybeSingle();
        if (profile.data?.account_status === "blocked") {
          return NextResponse.json({ ok: false, reason: "Your AQE account has been blocked by the Manager. Contact AQE support for assistance." }, { status: 403 });
        }
        if (profile.data?.account_status === "suspended") {
          return NextResponse.json({ ok: false, reason: "Your AQE account is temporarily suspended. Contact AQE support for assistance." }, { status: 403 });
        }
      }
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      return NextResponse.json({ ok: false, reason: "Invalid email/phone or password." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, mode: "supabase", user: data.user, session: data.session });
    response.cookies.set("aqe-access-token", data.session.access_token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: data.session.expires_in ?? 3600,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Login failed" }, { status: 400 });
  }
}
