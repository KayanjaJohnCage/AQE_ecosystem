import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Prize service is not configured." }, { status: 503 });
    const session = await resolveAuthenticatedSession(request);
    const userId = session.authenticated ? session.userId : null;
    let tier = "basic";
    let inviteCount = 0;
    if (userId) {
      const [{ data: profile }, { count }] = await Promise.all([
        client.from("profiles").select("tier").eq("user_id", userId).maybeSingle(),
        client.from("profiles").select("user_id", { count: "exact", head: true }).eq("referred_by", userId),
      ]);
      tier = profile?.tier || "basic";
      inviteCount = count ?? 0;
    }
    const { data: prizes, error } = await client.from("aqe_prizes")
      .select("id,ref_code,title,invite_requirement,tier_scope,reward_type,reward_description,cash_value,image_url,active,sort_order,created_at,updated_at")
      .eq("active", true).order("sort_order", { ascending: true });
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    const { data: claims } = userId
      ? await client.from("aqe_prize_claims").select("prize_id,mode,status,cash_amount,manager_note,created_at").eq("user_id", userId)
      : { data: [] };
    const claimMap = new Map((claims ?? []).map((claim) => [claim.prize_id, claim]));
    return NextResponse.json({
      ok: true, tier, inviteCount,
      prizes: (prizes ?? []).map((prize) => ({
        ...prize,
        eligible: inviteCount >= prize.invite_requirement && (prize.tier_scope === "all" || tier === "vip"),
        lockedReason: tier !== "vip" && prize.tier_scope === "vip"
          ? "VIP members only"
          : inviteCount < prize.invite_requirement
            ? String(prize.invite_requirement) + " direct invites required"
            : null,
        claim: claimMap.get(prize.id) ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Prizes unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Prize service is not configured." }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "create").trim().toLowerCase();

    if (action === "delete") {
      const id = String(body.id ?? "").trim();
      if (!id) return NextResponse.json({ ok: false, reason: "Prize ID is required." }, { status: 400 });
      const { error } = await client.from("aqe_prizes").delete().eq("id", id);
      if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const payload = {
      ref_code: String(body.refCode ?? "").trim().toUpperCase(),
      title: String(body.title ?? "").trim(),
      invite_requirement: Number(body.inviteRequirement ?? 0),
      tier_scope: body.tierScope === "all" ? "all" : "vip",
      reward_type: ["physical", "cash", "none"].includes(String(body.rewardType)) ? String(body.rewardType) : "physical",
      reward_description: String(body.rewardDescription ?? "").trim() || null,
      cash_value: body.cashValue === "" || body.cashValue === undefined || body.cashValue === null ? null : Number(body.cashValue),
      image_url: String(body.imageUrl ?? "").trim() || null,
      active: body.active !== false,
      sort_order: Number(body.sortOrder ?? 0),
      updated_at: new Date().toISOString(),
    };
    if (!payload.ref_code || !payload.title || !Number.isInteger(payload.invite_requirement) || payload.invite_requirement < 1) {
      return NextResponse.json({ ok: false, reason: "Reference, title and a positive invite requirement are required." }, { status: 400 });
    }
    if (payload.cash_value !== null && (!Number.isFinite(payload.cash_value) || payload.cash_value < 0)) {
      return NextResponse.json({ ok: false, reason: "Prize cash value must be a non-negative amount." }, { status: 400 });
    }
    const id = String(body.id ?? "").trim();
    const result = id
      ? await client.from("aqe_prizes").update(payload).eq("id", id).select().single()
      : await client.from("aqe_prizes").insert(payload).select().single();
    if (result.error) return NextResponse.json({ ok: false, reason: result.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, prize: result.data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Prize save failed." }, { status: 400 });
  }
}
