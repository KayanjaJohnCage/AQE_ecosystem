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
  const roleHeader =
    request.headers.get("x-user-role") ??
    request.headers.get("x-role") ??
    request.headers.get("role") ??
    "";
  const cookies = request.headers.get("cookie") ?? "";
  const cookieValues = Object.fromEntries(
    cookies.split(";").flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 0) return [];
      return [[
        entry.slice(0, separator).trim(),
        decodeURIComponent(entry.slice(separator + 1).trim()),
      ]];
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
  const role = normalizeRole(roleHeader) ?? tokenRole ?? cookieRole ?? "customer";

  return {
    authenticated: Boolean(resolvedBearerToken || userId),
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

  if (!requestSession.token || requestSession.token.startsWith("mock-")) {
    return requestSession;
  }

  const anonClient = createAnonSupabaseClient();
  if (!anonClient) return requestSession;

  const { data, error } = await anonClient.auth.getUser(requestSession.token);
  if (error || !data.user) {
    return {
      authenticated: false,
      token: requestSession.token,
      role: "customer",
    };
  }

  const claims = {
    ...data.user.app_metadata,
    ...data.user.user_metadata,
    role: data.user.user_metadata?.role,
  };

  let role = resolveRoleFromClaims(claims) ?? requestSession.role;
  const serverClient = createServerSupabaseClient();

  if (serverClient) {
    const { data: profile } = await serverClient
      .from("profiles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();

    role = normalizeRole(profile?.role) ?? role;
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
