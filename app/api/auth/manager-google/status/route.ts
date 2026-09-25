import { NextResponse } from "next/server";
import { createAnonSupabaseClient } from "../../../../../lib/supabaseServer";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|; )aqe-google-verified=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : "";
  if (!token) return NextResponse.json({ ok: true, verified: false });

  const client = createAnonSupabaseClient();
  if (!client) return NextResponse.json({ ok: true, verified: false });
  const { data } = await client.auth.getUser(token);
  if (!data.user) return NextResponse.json({ ok: true, verified: false });

  const expectedEmail = String(process.env.AQE_MANAGER_GOOGLE_EMAIL ?? "").trim().toLowerCase();
  const expectedSub = String(process.env.AQE_MANAGER_GOOGLE_SUB ?? "").trim();
  const identity = (data.user.identities ?? []).find((item) => item.provider === "google");
  const sub = String(identity?.identity_data?.sub ?? "").trim();
  const verified = Boolean(expectedEmail && expectedSub) &&
    String(data.user.email ?? "").toLowerCase() === expectedEmail && sub === expectedSub;
  return NextResponse.json({ ok: true, verified, email: verified ? data.user.email ?? "" : "" });
}
