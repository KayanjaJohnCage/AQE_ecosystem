import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

  const isDevelopment = process.env.NEXT_PUBLIC_APP_ENV !== "production";
  if (!hasSessionCookie && !hasSessionHeader && !isDevelopment) {
    const loginUrl = new URL("/customer", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Middleware can only inspect the request token synchronously. The API and
  // manager actions perform the authoritative role check after resolving the
  // Supabase profile, so an authenticated cookie must not be mistaken for a
  // customer role and redirected away from the manager console.
  return NextResponse.next();
}

export const config = {
  matcher: ["/manager/:path*", "/vip/:path*"],
};
