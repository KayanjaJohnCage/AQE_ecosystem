import { NextResponse } from "next/server";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  const s = await resolveAuthenticatedSession(request);
  if (!s.authenticated || !s.userId) {
    return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
  }

  const c = createServerSupabaseClient();
  if (!c) {
    return NextResponse.json({ ok: false, reason: "Earnings service unavailable." }, { status: 503 });
  }

  const [creator, referral, ledger] = await Promise.all([
    c.from("creator_earnings").select("*").eq("creator_id", s.userId).order("created_at", { ascending: false }).limit(100),
    c.from("referral_earnings").select("*").eq("beneficiary_user_id", s.userId).order("created_at", { ascending: false }).limit(1000),
    c.from("cash_wallet_ledger")
      .select("id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id,created_at")
      .eq("user_id", s.userId)
      .eq("direction", "CREDIT")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (creator.error || referral.error || ledger.error) {
    return NextResponse.json(
      { ok: false, reason: creator.error?.message || referral.error?.message || ledger.error?.message },
      { status: 500 },
    );
  }

  const creatorRows = creator.data || [];
  const referralRows = referral.data || [];
  const ledgerRows = ledger.data || [];

  const creditedReferralRows = referralRows.filter(
    (x: any) => String(x.status).toUpperCase() === "CREDITED",
  );

  // Referral earnings already have their authoritative amounts in referral_earnings.
  // Exclude their wallet-ledger mirrors here so the earnings card never double-counts them.
  const referralReferenceTypes = new Set([
    "DIRECT_REFERRAL_EARNING",
    "INDIRECT_REFERRAL_EARNING",
  ]);

  const otherEarnings = ledgerRows.filter(
    (x: any) => !referralReferenceTypes.has(String(x.reference_type || "").toUpperCase()),
  );

  const totalCreator = creatorRows.reduce((n: number, x: any) => n + Number(x.net_amount || 0), 0);
  const totalReferral = creditedReferralRows.reduce((n: number, x: any) => n + Number(x.amount || 0), 0);
  const totalOther = otherEarnings.reduce((n: number, x: any) => n + Number(x.amount || 0), 0);
  const totalEarnings = totalCreator + totalReferral + totalOther;

  return NextResponse.json({
    ok: true,
    source: "supabase",
    creatorEarnings: creatorRows,
    referralEarnings: referralRows,
    otherEarnings,
    totalCreator,
    totalReferral,
    totalOther,
    totalEarnings,
    currency: "UGX",
  });
}
