import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function sessionHashFromRequest(request: Request) {
  const token = request.headers.get("x-asset-room-token")?.trim();
  return token ? tokenHash(token) : "";
}

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Asset Room is not configured." }, { status: 503 });

    const { data: profile } = await client.from("profiles").select("tier").eq("user_id", session.userId).maybeSingle();
    if (profile?.tier !== "vip") return NextResponse.json({ ok: false, reason: "Asset Room is available to VIP members only." }, { status: 403 });

    const { data: room, error } = await client.from("vip_asset_rooms").select("salary_balance,withdrawn_salary_total,pin_set_at").eq("user_id", session.userId).maybeSingle();
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

    const configured = Boolean(room?.pin_set_at);
    const tokenHashValue = sessionHashFromRequest(request);
    if (!tokenHashValue) return NextResponse.json({ ok: true, configured, locked: true });

    const { data: accessSession } = await client.from("vip_asset_room_sessions")
      .select("id").eq("user_id", session.userId).eq("token_hash", tokenHashValue)
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!accessSession) return NextResponse.json({ ok: false, reason: "Asset Room is locked. Enter your PIN again." }, { status: 403 });

    const [{ data: wallet }, { count: directInvites }, { data: settingsRow }] = await Promise.all([
      client.from("cash_wallet").select("available_balance,pending_balance,currency").eq("user_id", session.userId).maybeSingle(),
      client.from("profiles").select("user_id", { count: "exact", head: true }).eq("referred_by", session.userId),
      client.from("platform_settings").select("settings").eq("id", 1).maybeSingle(),
    ]);
    const salaryBalance = Number(room?.salary_balance ?? 0);
    const walletBalance = Number(wallet?.available_balance ?? 0);
    const pendingWallet = Number(wallet?.pending_balance ?? 0);
    const day = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "2-digit" }).format(new Date()));
    return NextResponse.json({
      ok: true, configured, locked: false, currency: wallet?.currency || "UGX",
      directInvites: directInvites ?? 0, salaryBalance,
      withdrawnSalaryTotal: Number(room?.withdrawn_salary_total ?? 0),
      walletBalance, pendingWallet, netWorth: walletBalance + salaryBalance + pendingWallet,
      salaryWithdrawable: day >= 20,
      salaryPerInvite: Number(settingsRow?.settings?.pricing?.vipSalary ?? 10000),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Asset Room unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    if (!session.authenticated || !session.userId) return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Asset Room is not configured." }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim().toLowerCase();
    const { data: profile } = await client.from("profiles").select("tier").eq("user_id", session.userId).maybeSingle();
    if (profile?.tier !== "vip") return NextResponse.json({ ok: false, reason: "Asset Room is available to VIP members only." }, { status: 403 });

    if (action === "set_pin") {
      const pin = String(body.pin ?? "").trim();
      const currentPin = String(body.currentPin ?? "").trim();
      if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ ok: false, reason: "PIN must contain 4 to 6 digits." }, { status: 400 });
      const { data: room } = await client.from("vip_asset_rooms").select("pin_hash").eq("user_id", session.userId).maybeSingle();
      if (room?.pin_hash) {
        if (!/^\d{4,6}$/.test(currentPin)) return NextResponse.json({ ok: false, reason: "Current PIN is required to change your Asset Room PIN." }, { status: 400 });
        const { data: verified } = await client.rpc("verify_vip_asset_pin", { p_user_id: session.userId, p_pin: currentPin });
        if (!verified) return NextResponse.json({ ok: false, reason: "Current PIN is incorrect." }, { status: 403 });
      }
      const { data, error } = await client.rpc("set_vip_asset_pin", { p_user_id: session.userId, p_pin: pin });
      if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
      return NextResponse.json(data ?? { ok: true });
    }

    if (action === "unlock") {
      const pin = String(body.pin ?? "").trim();
      if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ ok: false, reason: "Enter your 4 to 6 digit PIN." }, { status: 400 });
      const { data: verified, error } = await client.rpc("verify_vip_asset_pin", { p_user_id: session.userId, p_pin: pin });
      if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
      if (!verified) return NextResponse.json({ ok: false, reason: "Incorrect Asset Room PIN." }, { status: 403 });
      const rawToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const inserted = await client.from("vip_asset_room_sessions").insert({
        user_id: session.userId, token_hash: tokenHash(rawToken), expires_at: expiresAt,
      }).select("expires_at").single();
      if (inserted.error) return NextResponse.json({ ok: false, reason: inserted.error.message }, { status: 500 });
      return NextResponse.json({ ok: true, token: rawToken, expiresAt: inserted.data.expires_at });
    }

    if (action === "withdraw_salary") {
      const tokenHashValue = sessionHashFromRequest(request);
      if (!tokenHashValue) return NextResponse.json({ ok: false, reason: "Unlock the Asset Room first." }, { status: 403 });
      const { data: accessSession } = await client.from("vip_asset_room_sessions").select("id")
        .eq("user_id", session.userId).eq("token_hash", tokenHashValue)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!accessSession) return NextResponse.json({ ok: false, reason: "Asset Room session expired. Enter your PIN again." }, { status: 403 });
      const { data, error } = await client.rpc("withdraw_vip_salary_atomic", { p_user_id: session.userId });
      if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
      return NextResponse.json(data);
    }
    return NextResponse.json({ ok: false, reason: "Unsupported Asset Room action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Asset Room action failed." }, { status: 400 });
  }
}
