import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAnonSupabaseClient, createServerSupabaseClient } from "../../../../lib/supabaseServer";
import { createManagerGateToken } from "../../../../lib/aqe/auth";

function phoneVariants(value: string) {
  const cleaned = value.trim().replace(/[\\s().-]/g, "");
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

async function resolveLoginEmail(identifier: string, server: any) {
  if (identifier.includes("@")) return identifier.toLowerCase();
  if (!server) return null;
  const { data, error } = await server.from("profiles").select("user_id, phone").in("phone", phoneVariants(identifier)).limit(2);
  if (error || !data || data.length !== 1) return null;
  const user = await server.auth.admin.getUserById(data[0].user_id);
  if (user.error || !user.data.user?.email) return null;
  return user.data.user.email.toLowerCase();
}

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function recoverConfiguredManagerPassword(server: any, email: string, password: string) {
  const configuredPassword = String(process.env.AQE_MANAGER_PASSWORD ?? "");
  if (!configuredPassword || !email.includes("@") || !sameSecret(password, configuredPassword)) return null;

  const usersResult = await server.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersResult.error) return null;
  const target = (usersResult.data?.users ?? []).find(
    (item: any) => String(item.email ?? "").trim().toLowerCase() === email,
  );
  if (!target?.id) return null;

  const { data: roles } = await server
    .from("user_roles")
    .select("role_name")
    .eq("user_id", target.id)
    .in("role_name", ["admin", "manager"]);
  const roleNames = (roles ?? [])
    .map((item: any) => String(item.role_name ?? "").toLowerCase())
    .filter((value: string) => value === "admin" || value === "manager");
  if (!roleNames.length) return null;

  // The configured manager password is a server-only bootstrap/administrative
  // credential. If the Supabase email identity has no known password yet,
  // synchronize it server-side, then use the normal Supabase password flow.
  const updated = await server.auth.admin.updateUserById(target.id, {
    password: configuredPassword,
  });
  if (updated.error) return null;
  return configuredPassword;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body.identifier ?? body.email ?? body.phone ?? "").trim();
    const password = String(body.password ?? "");
    if (!identifier || !password) {
      return NextResponse.json({ ok: false, reason: "Manager email/phone and password are required." }, { status: 400 });
    }

    const anon = createAnonSupabaseClient();
    const server = createServerSupabaseClient();
    if (!anon || !server) {
      return NextResponse.json({ ok: false, reason: "Manager authentication is not configured." }, { status: 503 });
    }

    const email = await resolveLoginEmail(identifier, server);
    if (!email) {
      return NextResponse.json({ ok: false, reason: "Invalid manager email/phone or password." }, { status: 401 });
    }

    let passwordLogin = await anon.auth.signInWithPassword({ email, password });

    if (passwordLogin.error || !passwordLogin.data.user || !passwordLogin.data.session) {
      const configuredPassword = await recoverConfiguredManagerPassword(server, email, password);
      if (configuredPassword) {
        passwordLogin = await anon.auth.signInWithPassword({ email, password: configuredPassword });
      }
    }

    if (passwordLogin.error || !passwordLogin.data.user || !passwordLogin.data.session) {
      return NextResponse.json({ ok: false, reason: "Invalid manager email/phone or password." }, { status: 401 });
    }

    const { data: roles } = await server.from("user_roles").select("role_name").eq("user_id", passwordLogin.data.user.id).in("role_name", ["admin", "manager"]);
    const roleNames = (roles ?? []).map((item) => String(item.role_name ?? "").toLowerCase()).filter((value) => value === "admin" || value === "manager");
    if (!roleNames.length) {
      return NextResponse.json({ ok: false, reason: "This account is not authorized for the AQE management console." }, { status: 403 });
    }

    const role = roleNames.includes("admin") ? "admin" : "manager";
    const response = NextResponse.json({ ok: true, role, user: { id: passwordLogin.data.user.id, email: passwordLogin.data.user.email ?? email } });
    response.cookies.set("aqe-access-token", passwordLogin.data.session.access_token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: passwordLogin.data.session.expires_in ?? 3600,
    });
    response.cookies.set("aqe-manager-session", createManagerGateToken(passwordLogin.data.user.id), {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1800,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Manager authentication failed." }, { status: 400 });
  }
}
