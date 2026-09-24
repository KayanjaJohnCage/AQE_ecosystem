import { NextResponse } from "next/server";

export async function GET() {
  const hasPublicSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const hasServerSupabase = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const isProduction = process.env.NEXT_PUBLIC_APP_ENV === "production";
  const hasCronSecret = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16);
  const ready = hasPublicSupabase && hasServerSupabase && (!isProduction || hasCronSecret);

  return NextResponse.json(
    {
      ok: ready,
      app: "aqe-ecosystem",
      environment: isProduction ? "production" : process.env.NEXT_PUBLIC_APP_ENV ?? "development",
      checks: {
        supabase: ready ? "configured" : "incomplete",
        cron: isProduction ? (hasCronSecret ? "configured" : "missing") : "not-required",
      },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
