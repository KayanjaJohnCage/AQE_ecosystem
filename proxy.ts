import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = ["/aqe-control", "/vip"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // The legacy /manager URL is never the customer-facing entry point.
  // Send it to the restricted manager sign-in instead of exposing the console.
  if (pathname === "/manager" || pathname.startsWith("/manager/")) {
    return NextResponse.redirect(new URL("/aqe-control/login", request.url));
  }

  // The login page itself must remain reachable without an existing session.
  if (pathname === "/aqe-control/login" || pathname.startsWith("/aqe-control/login/")) {
    return NextResponse.next();
  }

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

  // Production UI access must be backed by a session cookie. Client-supplied
  // identity/role headers are never sufficient to enter protected consoles.
  const hasSessionHeader = Boolean(request.headers.get("authorization"));
  const isDevelopment = process.env.NEXT_PUBLIC_APP_ENV !== "production";
  const hasProductionSession = hasSessionCookie || hasSessionHeader;
  if (!hasProductionSession && !isDevelopment) {
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
  matcher: ["/manager/:path*", "/aqe-control/:path*", "/vip/:path*"],
};
