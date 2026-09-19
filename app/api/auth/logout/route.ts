import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  for (const name of [
    "aqe-access-token",
    "sb-access-token",
    "supabase-auth-token",
    "sb-refresh-token",
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      expires: new Date(0),
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}
