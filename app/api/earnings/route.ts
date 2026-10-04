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

  const [creator, referral, ledger, vipSalary, vipAsset] = await Promise.all([
    c.from("creator_earnings").select("*").eq("creator_id", s.userId).order("created_at", { ascending: false }).limit(100),
    c.from("referral_earnings").select("*").eq("beneficiary_user_id", s.userId).order("created_at", { ascending: false }).limit(1000),
    c.from("cash_wallet_ledger")
      .select("id,payment_order_id,amount,direction,currency,balance_after,reference_type,reference_id,created_at")
      .eq("user_id", s.userId)
      .eq("direction", "CREDIT")
      .order("created_at", { ascending: false })
      .limit(1000),
    c.from("vip_salary_payments")
      .select("id,period,invite_count,salary_per_invite,amount,currency,status,created_at")
      .eq("user_id", s.userId)
      .order("created_at", { ascending: false })
      .limit(100),
    c.from("vip_asset_rooms")
      .select("salary_balance,withdrawn_salary_total,updated_at")
      .eq("user_id", s.userId)
      .maybeSingle(),
  ]);

  if (creator.error || referral.error || ledger.error || vipSalary.error || vipAsset.error) {
    return NextResponse.json(
      { ok: false, reason: creator.error?.message || referral.error?.message || ledger.error?.message || vipSalary.error?.message || vipAsset.error?.message },
      { status: 500 },
    );
  }

  const creatorRows = creator.data || [];
  const referralRows = referral.data || [];
  const ledgerRows = ledger.data || [];
  const vipSalaryRows = vipSalary.data || [];
  const vipSalaryRoom = vipAsset.data || null;
  const vipSalaryTotal = vipSalaryRows.reduce((n: number, x: any) => n + Number(x.amount || 0), 0);
  const vipSalaryLockedBalance = Math.max(
    0,
    Number(vipSalaryRoom?.salary_balance || 0) - Number(vipSalaryRoom?.withdrawn_salary_total || 0),
  );

  const creditedReferralRows = referralRows.filter(
    (x: any) => String(x.status).toUpperCase() === "CREDITED",
  );

  // Referral earnings already have their authoritative amounts in referral_earnings.
  // Exclude their wallet-ledger mirrors here so the earnings card never double-counts them.
  const referralReferenceTypes = new Set([
    "DIRECT_REFERRAL_EARNING",
    "INDIRECT_REFERRAL_EARNING",
  ]);

  // Only income-producing ledger credits belong in the Earnings card.
  // WALLET_DEPOSIT is customer cash funding, not earned income. Likewise,
  // referral wallet credits are already represented by referral_earnings.
  const earnedLedgerReferenceTypes = new Set([
    "WELCOME_BONUS",
    "VIP_SALARY",
    "CREATOR_EARNING",
    "CONTENT_EARNING",
    "TEAM_LEADER_EARNING",
  ]);
  const otherEarnings = ledgerRows.filter((x: any) =>
    earnedLedgerReferenceTypes.has(String(x.reference_type || "").toUpperCase()),
  );

  const totalCreator = creatorRows.reduce((n: number, x: any) => n + Number(x.net_amount || 0), 0);
  const totalReferral = creditedReferralRows.reduce((n: number, x: any) => n + Number(x.amount || 0), 0);
  const totalOther = otherEarnings.reduce((n: number, x: any) => n + Number(x.amount || 0), 0);
  const totalEarnings = totalCreator + totalReferral + totalOther;
  const isVip = await (async () => {
    const p = await c.from("profiles").select("tier,verification_status").eq("user_id", s.userId).maybeSingle();
    return String(p.data?.tier || "").toLowerCase() === "vip" && String(p.data?.verification_status || "").toLowerCase() === "approved";
  })();
  const nowEastAfrica = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    day: "2-digit",
  }).format(new Date());
  const dayOfMonth = Number(nowEastAfrica);
  const salaryWithdrawable = Boolean(isVip && dayOfMonth >= 20);
  const lockedVipSalary = salaryWithdrawable ? 0 : vipSalaryLockedBalance;

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
    vipSalary: {
      payments: vipSalaryRows,
      totalCredited: vipSalaryTotal,
      assetBalance: Number(vipSalaryRoom?.salary_balance || 0),
      withdrawnTotal: Number(vipSalaryRoom?.withdrawn_salary_total || 0),
      lockedBalance: lockedVipSalary,
      withdrawableBalance: salaryWithdrawable ? vipSalaryLockedBalance : 0,
      withdrawableOnDay: 20,
      withdrawableToday: salaryWithdrawable,
    },
    withdrawableEarnings: totalEarnings,
    currency: "UGX",
  });
}
