import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

const PUBLIC_SITE_URL = String(
  process.env.NEXT_PUBLIC_SITE_URL || "https://afiqueerescortsecosystem.com",
).replace(/\/$/, "");

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json(
        { ok: false, reason: "Authentication required." },
        { status: 401 },
      );
    }

    const client = createServerSupabaseClient();
    if (!client) {
      return NextResponse.json({
        ok: false,
        reason: "Referral service is unavailable.",
      }, { status: 503 });
    }

    const profile = await client
      .from("profiles")
      .select("user_id,display_name,tier,verification_status,referral_code,referred_by,created_at")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (profile.error) {
      return NextResponse.json({ ok: false, reason: profile.error.message }, { status: 500 });
    }
    if (!profile.data) {
      return NextResponse.json({ ok: false, reason: "Customer profile not found." }, { status: 404 });
    }

    const directProfiles = await client
      .from("profiles")
      .select("user_id,display_name,tier,verification_status,account_status,created_at")
      .eq("referred_by", session.userId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (directProfiles.error) {
      return NextResponse.json({ ok: false, reason: directProfiles.error.message }, { status: 500 });
    }

    const directRows = directProfiles.data ?? [];
    const directIds = directRows.map((row) => row.user_id).filter(Boolean);

    const indirectProfiles = directIds.length
      ? await client
          .from("profiles")
          .select("user_id,display_name,tier,verification_status,account_status,created_at,referred_by")
          .in("referred_by", directIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : { data: [], error: null };

    if (indirectProfiles.error) {
      return NextResponse.json({ ok: false, reason: indirectProfiles.error.message }, { status: 500 });
    }

    const earnings = await client
      .from("referral_earnings")
      .select("id,beneficiary_user_id,referred_user_id,payment_order_id,relationship_level,rate,amount,currency,status,created_at")
      .eq("beneficiary_user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (earnings.error) {
      return NextResponse.json({ ok: false, reason: earnings.error.message }, { status: 500 });
    }

    const earningRows = earnings.data ?? [];
    const credited = earningRows.filter((row) => String(row.status).toUpperCase() === "CREDITED");
    const directEarnings = credited.filter((row) => Number(row.relationship_level) === 1);
    const indirectEarnings = credited.filter((row) => Number(row.relationship_level) === 2);

    const earningsByUser = new Map<string, { direct: number; indirect: number; total: number }>();
    for (const row of credited) {
      const id = String(row.referred_user_id);
      const previous = earningsByUser.get(id) ?? { direct: 0, indirect: 0, total: 0 };
      const amount = Number(row.amount || 0);
      if (Number(row.relationship_level) === 1) previous.direct += amount;
      if (Number(row.relationship_level) === 2) previous.indirect += amount;
      previous.total += amount;
      earningsByUser.set(id, previous);
    }

    const directTeam = directRows.map((row) => ({
      userId: row.user_id,
      name: row.display_name || "AQE Member",
      tier: row.tier || "basic",
      verificationStatus: row.verification_status || "unverified",
      accountStatus: row.account_status || "active",
      joinedAt: row.created_at,
      relationshipLevel: 1,
      earnings: earningsByUser.get(row.user_id) ?? { direct: 0, indirect: 0, total: 0 },
    }));

    const indirectTeam = (indirectProfiles.data ?? []).map((row) => ({
      userId: row.user_id,
      name: row.display_name || "AQE Member",
      tier: row.tier || "basic",
      verificationStatus: row.verification_status || "unverified",
      accountStatus: row.account_status || "active",
      joinedAt: row.created_at,
      relationshipLevel: 2,
      referredThroughUserId: row.referred_by,
      earnings: earningsByUser.get(row.user_id) ?? { direct: 0, indirect: 0, total: 0 },
    }));

    const referralCode = profile.data.referral_code
      ? String(profile.data.referral_code).toUpperCase()
      : null;

    return NextResponse.json({
      ok: true,
      source: "supabase",
      referralCode,
      referralLink: referralCode
        ? PUBLIC_SITE_URL + "/customer?ref=" + encodeURIComponent(referralCode)
        : null,
      directCount: directTeam.length,
      indirectCount: indirectTeam.length,
      directEarnings: directEarnings.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      indirectEarnings: indirectEarnings.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      totalEarnings: credited.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      currency: credited[0]?.currency || "UGX",
      team: {
        direct: directTeam,
        indirect: indirectTeam,
      },
      earnings: earningRows,
      policy: {
        direct: "Configured by membership tier",
        indirect: "Configured by membership tier",
        settlement: "Referral earnings are credited only after the referred member's eligible membership payment is confirmed.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Referral data unavailable.",
      },
      { status: 500 },
    );
  }
}
