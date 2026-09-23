import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["customer", "manager", "admin"]);
    if (!access.ok || !access.session?.userId) return NextResponse.json({ ok: false, reason: access.reason || "Authentication required." }, { status: 401 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Wallet service is not configured." }, { status: 503 });

    const userId = access.session.userId;
    const wallet = await client.from("cash_wallet").select("user_id,available_balance,pending_balance,currency,updated_at").eq("user_id", userId).maybeSingle();
    if (wallet.error) return NextResponse.json({ ok: false, reason: wallet.error.message }, { status: 500 });
    const ledger = await client.from("cash_wallet_ledger").select("id,amount,direction,currency,balance_after,reference_type,reference_id,created_at").eq("user_id", userId).order("created_at",{ascending:false}).limit(100);
    if (ledger.error) return NextResponse.json({ ok: false, reason: ledger.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, wallet: wallet.data ?? { user_id:userId, available_balance:0, pending_balance:0, currency:"UGX" }, ledger: ledger.data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Wallet unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
  if (!access.ok) return NextResponse.json({ ok: false, reason: "Wallet mutations must use a confirmed payment, reward, referral, or withdrawal ledger operation." }, { status: 403 });
  return NextResponse.json({ ok: false, reason: "Direct wallet mutation is disabled. Use the appropriate audited transaction flow." }, { status: 405 });
}
