import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRoleAccess, type AqeRole } from "./lib/aqe/auth";

const protectedPrefixes = ["/manager", "/vip"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const matchedPrefix = protectedPrefixes.find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!matchedPrefix) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(
    request.cookies.get("aqe-access-token") ||
    request.cookies.get("sb-access-token") ||
    request.cookies.get("supabase-auth-token") ||
    request.cookies.get("sb-refresh-token"),
  );

  const hasSessionHeader = Boolean(
    request.headers.get("authorization") ||
    request.headers.get("x-user-id") ||
    request.headers.get("x-user-role"),
  );

  if (!hasSessionCookie && !hasSessionHeader) {
    const loginUrl = new URL("/customer", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const allowedRoles: AqeRole[] =
    matchedPrefix === "/manager"
      ? ["manager", "admin"]
      : ["customer", "manager", "admin"];
  const access = requireRoleAccess(request, allowedRoles);

  if (!access.ok) {
    const loginUrl = new URL("/customer", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/manager/:path*", "/vip/:path*"],
};
