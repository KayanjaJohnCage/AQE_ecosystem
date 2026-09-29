import { NextResponse } from "next/server";
import { createAnonSupabaseClient } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = String(body.accessToken ?? "").trim();

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, reason: "Verification session is missing." },
        { status: 400 },
      );
    }

    const client = createAnonSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { ok: false, reason: "Authentication service is not configured." },
        { status: 503 },
      );
    }

    // Validate the bearer token against Supabase Auth before issuing AQE's
    // server-side authentication cookie. Never log the token.
    const { data, error } = await client.auth.getUser(accessToken);

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, reason: "The verification session is invalid or expired." },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? null,
      },
    });

    response.cookies.set("aqe-access-token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 3600,
    });

    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Email verification failed.",
      },
      { status: 400 },
    );
  }
}
