import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createAnonSupabaseClient,
  createServerSupabaseClient,
} from "../supabaseServer";

export type AqeRole = "customer" | "manager" | "admin";

export type AqeSession = {
  authenticated: boolean;
  userId?: string;
  email?: string;
  role: AqeRole;
  token?: string;
};

export const AQE_ROLES: AqeRole[] = ["customer", "manager", "admin"];

export type AqeTier = "basic" | "premium" | "vip";

export function normalizeRole(value?: string | null): AqeRole | null {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!candidate) return null;

  const normalized = candidate.replace(/[_-]+/g, " ");
  const compact = normalized.replace(/\s+/g, "");

  if (["manager", "managerrole", "staff"].includes(compact)) return "manager";
  if (["admin", "administrator", "superadmin", "super-admin"].includes(compact))
    return "admin";
  if (["customer", "user", "member", "client"].includes(compact))
    return "customer";

  return null;
}

export function normalizeTier(value?: string | null): AqeTier {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!candidate) return "basic";

  const compact = candidate.replace(/[_\-\s]+/g, "");

  if (["vip", "viptier", "vipmember"].includes(compact)) {
    return "vip";
  }

  if (["premium", "pro", "plus"].includes(compact)) {
    return "premium";
  }

  return "basic";
}

export function resolveRoleFromClaims(
  claims: Record<string, unknown> | null | undefined,
): AqeRole | null {
  if (!claims) return null;

  const possibleSources = [
    claims.user_role,
    claims.role,
    claims.userRole,
    claims.roles,
    claims.app_metadata,
    claims.user_metadata,
  ];

  for (const source of possibleSources) {
    if (Array.isArray(source)) {
      for (const item of source) {
        const normalized = normalizeRole(
          typeof item === "string" ? item : String(item ?? ""),
        );
        if (normalized) return normalized;
      }
    }

    if (source && typeof source === "object") {
      const nestedRole = resolveRoleFromClaims(
        source as Record<string, unknown>,
      );
      if (nestedRole) return nestedRole;
    }

    if (typeof source === "string") {
      const normalized = normalizeRole(source);
      if (normalized) return normalized;
    }
  }

  return null;
}

export function resolveRoleFromToken(
  token: string | null | undefined,
): AqeRole | null {
  if (!token) return null;

  const sanitized = token.trim();
  if (
    !sanitized ||
    sanitized === "mock-session-token" ||
    sanitized === "mock-refresh-token"
  ) {
    return null;
  }

  const parts = sanitized.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return resolveRoleFromClaims(payload);
  } catch {
    return null;
  }
}

function managerSecret() {
  const secret = process.env.AQE_MANAGER_SESSION_SECRET || process.env.CRON_SECRET;
  if (!secret && process.env.NEXT_PUBLIC_APP_ENV === "production") {
    throw new Error("AQE manager session secret is not configured.");
  }
  return secret || "dev-only-aqe-manager-session-secret";
}

function managerCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(/(?:^|; )aqe-manager-session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function encodeManagerPayload(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function createManagerGateToken(userId: string) {
  const payload = encodeManagerPayload(
    JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 1800 }),
  );
  const signature = createHmac("sha256", managerSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyManagerGateToken(request: Request, expectedUserId?: string) {
  const token = managerCookie(request);
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  try {
    const expected = createHmac("sha256", managerSecret()).update(payload).digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };
    return Boolean(
      parsed.sub &&
        parsed.exp &&
        parsed.exp > Math.floor(Date.now() / 1000) &&
        (!expectedUserId || parsed.sub === expectedUserId),
    );
  } catch {
    return false;
  }
}

export function getSessionFromRequest(request: Request): AqeSession {
  const authorization =
    request.headers.get("authorization") ??
    request.headers.get("Authorization") ??
    "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : authorization.trim();

  const userId =
    request.headers.get("x-user-id") ?? request.headers.get("user-id") ?? "";
  const email =
    request.headers.get("x-user-email") ?? request.headers.get("email") ?? "";
  // In production, client-supplied identity/role headers are never trusted.
  // They remain available only for local development compatibility.
  const isProduction = process.env.NEXT_PUBLIC_APP_ENV === "production";
  const roleHeader = isProduction
    ? ""
    : request.headers.get("x-user-role") ??
      request.headers.get("x-role") ??
      request.headers.get("role") ??
      "";
  const cookies = request.headers.get("cookie") ?? "";
  const cookieValues = Object.fromEntries(
    cookies.split(";").flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 0) return [];
      return [
        [
          entry.slice(0, separator).trim(),
          decodeURIComponent(entry.slice(separator + 1).trim()),
        ],
      ];
    }),
  );
  const cookieToken =
    cookieValues["sb-access-token"] ||
    cookieValues["supabase-auth-token"] ||
    cookieValues["aqe-access-token"] ||
    "";
  const resolvedBearerToken = bearerToken || cookieToken;
  const tokenRole = resolveRoleFromToken(resolvedBearerToken);
  const cookieRole = resolveRoleFromToken(cookieToken);
  const role =
    normalizeRole(roleHeader) ?? tokenRole ?? cookieRole ?? "customer";

  // Production authentication requires a real bearer/session cookie token.
  // Header-only identity is a development convenience and must not authorize
  // requests against the live application.
  const authenticated = isProduction
    ? Boolean(resolvedBearerToken)
    : Boolean(resolvedBearerToken || userId);

  return {
    authenticated,
    userId: userId || undefined,
    email: email || undefined,
    role,
    token: resolvedBearerToken || undefined,
  };
}

export async function resolveAuthenticatedSession(
  request: Request,
): Promise<AqeSession> {
  const requestSession = getSessionFromRequest(request);

  const isProduction = process.env.NEXT_PUBLIC_APP_ENV === "production";

  if (!requestSession.token || requestSession.token.startsWith("mock-")) {
    if (isProduction) {
      return {
        authenticated: false,
        role: "customer",
      };
    }
    return requestSession;
  }

  const anonClient = createAnonSupabaseClient();
  if (!anonClient) {
    if (isProduction) {
      return {
        authenticated: false,
        role: "customer",
        token: requestSession.token,
      };
    }
    return requestSession;
  }

  const { data, error } = await anonClient.auth.getUser(requestSession.token);
  if (error || !data.user) {
    return {
      authenticated: false,
      token: requestSession.token,
      role: "customer",
    };
  }

  // Never trust role headers or user metadata for authorization after a real
  // Supabase session has been verified. Production roles come from the
  // server-side profile record; missing/unknown roles default to customer.
  let role: AqeRole = "customer";
  const serverClient = createServerSupabaseClient();

  if (serverClient) {
    const { data: profile } = await serverClient
      .from("profiles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();

    role = normalizeRole(profile?.role) ?? "customer";
  }

  return {
    authenticated: true,
    userId: data.user.id,
    email: data.user.email ?? requestSession.email,
    role,
    token: requestSession.token,
  };
}

export async function resolveMutationUserId(
  request: Request,
  requestedUserId?: string,
) {
  const session = await resolveAuthenticatedSession(request);
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (supabaseConfigured) {
    if (!session.authenticated || !session.userId || !session.token) {
      return { ok: false as const, reason: "Authentication required." };
    }

    if (requestedUserId && requestedUserId !== session.userId) {
      return {
        ok: false as const,
        reason: "User identity does not match the authenticated session.",
      };
    }

    return { ok: true as const, userId: session.userId };
  }

  return {
    ok: true as const,
    userId: requestedUserId || session.userId || "demo-user",
  };
}

export async function requireAuthenticatedRoleAccess(
  request: Request,
  allowedRoles: AqeRole[],
) {
  const session = await resolveAuthenticatedSession(request);

  if (!session.authenticated) {
    return { ok: false as const, reason: "Authentication required." };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      ok: false as const,
      reason: `Access denied for role ${session.role}.`,
    };
  }

  if (
    (session.role === "manager" || session.role === "admin") &&
    !verifyManagerGateToken(request, session.userId)
  ) {
    return {
      ok: false as const,
      reason: "Manager console password verification is required.",
    };
  }

  return { ok: true as const, session };
}

export function requireRoleAccess(
  request: Request,
  allowedRoles: AqeRole[],
): { ok: boolean; session?: AqeSession; reason?: string } {
  const session = getSessionFromRequest(request);

  if (!session.authenticated) {
    return { ok: false, reason: "Authentication required." };
  }

  if (!allowedRoles.includes(session.role)) {
    return { ok: false, reason: `Access denied for role ${session.role}.` };
  }

  return { ok: true, session };
}

export function canAccessManagerConsole(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  return normalized === "manager" || normalized === "admin";
}

export function canAccessAdminConsole(role?: string | null): boolean {
  return normalizeRole(role) === "admin";
}

export function assertRole(
  role: string | null | undefined,
  allowed: AqeRole[],
): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  return allowed.includes(normalized);
}

export function getUpgradePromptForRole(role?: string | null) {
  const normalized = normalizeRole(role);

  if (!normalized || normalized === "customer") {
    return "Create an account or upgrade to access manager-only features.";
  }

  if (normalized === "manager") {
    return "Manager access is active. Admin approval may be required for restricted actions.";
  }

  return "Admin access confirmed.";
}
