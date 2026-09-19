import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
    }
    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({
        ok: true,
        source: "demo",
        referralCode: "AQE-DEMO",
        directCount: 0,
        indirectCount: 0,
        directEarnings: 0,
        indirectEarnings: 0,
        currency: "UGX",
      });
    }

    const profile = await client
      .from("profiles")
      .select("referral_code")
      .eq("user_id", session.userId)
      .maybeSingle();
    const earnings = await client
      .from("referral_earnings")
      .select("relationship_level, amount, currency, referred_user_id")
      .eq("beneficiary_user_id", session.userId)
      .eq("status", "CREDITED");
    if (earnings.error) {
      return NextResponse.json({ ok: false, reason: earnings.error.message }, { status: 500 });
    }

    const rows = earnings.data ?? [];
    const direct = rows.filter((row) => row.relationship_level === 1);
    const indirect = rows.filter((row) => row.relationship_level === 2);
    return NextResponse.json({
      ok: true,
      source: "supabase",
      referralCode: profile.data?.referral_code ?? null,
      referralLink: profile.data?.referral_code
        ? `/customer?ref=${encodeURIComponent(profile.data.referral_code)}`
        : null,
      directCount: new Set(direct.map((row) => row.referred_user_id)).size,
      indirectCount: new Set(indirect.map((row) => row.referred_user_id)).size,
      directEarnings: direct.reduce((sum, row) => sum + Number(row.amount), 0),
      indirectEarnings: indirect.reduce((sum, row) => sum + Number(row.amount), 0),
      currency: rows[0]?.currency ?? "UGX",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Referral data unavailable." }, { status: 500 });
  }
}