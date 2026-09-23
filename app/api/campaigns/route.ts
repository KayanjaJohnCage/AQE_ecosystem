import { NextResponse } from "next/server";
import { requireAuthenticatedRoleAccess, resolveAuthenticatedSession } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

async function manager(request: Request) {
  return requireAuthenticatedRoleAccess(request, ["manager", "admin"]);
}

export async function GET(request: Request) {
  const client = createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: true, campaigns: [], codes: [], packages: [] });
  const session = await resolveAuthenticatedSession(request);
  if (!session.authenticated) return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const includeManagerData = url.searchParams.get("manage") === "1";
  if (includeManagerData) {
    const access = await manager(request);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
  }
  const campaigns = await client.from("campaigns").select("*").order("created_at", { ascending: false });
  if (campaigns.error) return NextResponse.json({ ok: false, reason: campaigns.error.message }, { status: 500 });
  const campaignIds = (campaigns.data ?? []).map((x) => x.id);
  if (!campaignIds.length) return NextResponse.json({ ok: true, campaigns: [], codes: [], packages: [] });
  const [codes, packages] = await Promise.all([
    client.from("campaign_codes").select("*").in("campaign_id", campaignIds).order("created_at", { ascending: false }),
    client.from("campaign_gift_packages").select("*").in("campaign_id", campaignIds).order("created_at", { ascending: false }),
  ]);
  if (codes.error || packages.error) return NextResponse.json({ ok: false, reason: codes.error?.message || packages.error?.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaigns: campaigns.data ?? [], codes: codes.data ?? [], packages: packages.data ?? [] });
}

export async function POST(request: Request) {
  try {
    const access = await manager(request);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Campaign database is unavailable." }, { status: 503 });
    const action = String(body.action || "campaign").toLowerCase();

    if (action === "campaign") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ ok: false, reason: "Campaign name is required." }, { status: 400 });
      const { data, error } = await client.from("campaigns").insert({
        name,
        description: body.description ? String(body.description) : null,
        starts_at: body.startsAt || null,
        ends_at: body.endsAt || null,
        status: ["draft","active","paused","completed"].includes(body.status) ? body.status : "draft",
        created_by: access.session?.userId || null,
      }).select("*").single();
      if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, campaign: data });
    }

    if (action === "code" || action === "package") {
      const campaignId = String(body.campaignId || "").trim();
      if (!campaignId) return NextResponse.json({ ok: false, reason: "Campaign is required." }, { status: 400 });
      const common = {
        campaign_id: campaignId,
        qc_amount: Math.max(0, Number(body.qcAmount || 0)),
        cash_amount: Math.max(0, Number(body.cashAmount || 0)),
        cash_currency: String(body.cashCurrency || "UGX").toUpperCase(),
        boost_days: Math.max(0, Math.min(365, Number(body.boostDays || 0))),
        boost_label: body.boostLabel ? String(body.boostLabel).trim() : null,
        expires_at: body.expiresAt || null,
        active: body.active !== false,
        eligibility_tiers: Array.isArray(body.eligibilityTiers) ? body.eligibilityTiers.filter((x: unknown) => ["basic","premium","vip"].includes(String(x))) : [],
      };
      if (action === "code") {
        const code = String(body.code || "").trim().toUpperCase();
        if (!code) return NextResponse.json({ ok: false, reason: "Campaign code is required." }, { status: 400 });
        const { data, error } = await client.from("campaign_codes").insert({ ...common, code, usage_limit: body.usageLimit == null || body.usageLimit === "" ? null : Math.max(1, Number(body.usageLimit)) }).select("*").single();
        if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, code: data });
      }
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ ok: false, reason: "Package name is required." }, { status: 400 });
      const { data, error } = await client.from("campaign_gift_packages").insert({ ...common, name, description: body.description ? String(body.description) : null, quantity: body.quantity == null || body.quantity === "" ? null : Math.max(1, Number(body.quantity)) }).select("*").single();
      if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, package: data });
    }

    return NextResponse.json({ ok: false, reason: "Unknown campaign action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Campaign operation failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await manager(request);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Campaign database is unavailable." }, { status: 503 });
    const table = body.type === "code" ? "campaign_codes" : body.type === "package" ? "campaign_gift_packages" : "campaigns";
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ ok: false, reason: "Campaign item ID is required." }, { status: 400 });
    const allowed: Record<string, string[]> = {
      campaigns: ["name","description","starts_at","ends_at","status"],
      campaign_codes: ["active","usage_limit","expires_at","eligibility_tiers"],
      campaign_gift_packages: ["active","quantity","expires_at","eligibility_tiers"],
    };
    const patch: Record<string, unknown> = {};
    for (const key of allowed[table]) if (key in body) patch[key] = body[key];
    patch.updated_at = new Date().toISOString();
    const { data, error } = await client.from(table).update(patch).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Campaign update failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await manager(request);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.reason }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Campaign database is unavailable." }, { status: 503 });
    const table = body.type === "code" ? "campaign_codes" : body.type === "package" ? "campaign_gift_packages" : "campaigns";
    const id = String(body.id || "").trim();
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "Campaign deletion failed." }, { status: 500 });
  }
}
