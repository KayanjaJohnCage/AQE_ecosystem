import { NextResponse } from "next/server";
import { resolveAuthenticatedSession, resolveMutationUserId } from "../../../lib/aqe/auth";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: true, settings: null, subscription: null });

    const url = new URL(request.url);
    const vipUserId = String(url.searchParams.get("vipUserId") ?? "").trim();
    if (!vipUserId) return NextResponse.json({ ok: false, reason: "VIP profile is required." }, { status: 400 });

    const { data: vip } = await client.from("profiles").select("user_id,tier,display_name").eq("user_id", vipUserId).maybeSingle();
    if (!vip || vip.tier !== "vip") return NextResponse.json({ ok: false, reason: "VIP profile not found." }, { status: 404 });

    const { data: settings } = await client.from("vip_content_settings").select("vip_user_id,enabled,monthly_price,currency,title,description").eq("vip_user_id", vipUserId).maybeSingle();
    const session = await resolveAuthenticatedSession(request);

    let subscription = null;
    let creatorStats = null;
    if (session.authenticated && session.userId === vipUserId) {
      const [{ count }, { data: earningsRows }] = await Promise.all([
        client.from("vip_content_subscriptions").select("id", { count: "exact", head: true }).eq("vip_user_id", vipUserId).eq("status", "active").gt("expires_at", new Date().toISOString()),
        client.from("cash_wallet_ledger").select("amount").eq("user_id", vipUserId).eq("reference_type", "VIP_CONTENT_SUBSCRIPTION_EARNING"),
      ]);
      creatorStats = {
        activeSubscribers: count ?? 0,
        grossEarnings: (earningsRows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      };
    }
    if (session.authenticated && session.userId) {
      const { data } = await client
        .from("vip_content_subscriptions")
        .select("id,status,starts_at,expires_at,amount,currency")
        .eq("subscriber_user_id", session.userId)
        .eq("vip_user_id", vipUserId)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      subscription = data ?? null;
    }

    return NextResponse.json({
      ok: true,
      settings: settings ?? { vipUserId, enabled: false, monthlyPrice: 0, currency: "UGX", title: "VIP Content", description: null },
      subscription,
      subscribed: Boolean(subscription),
      creatorStats,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "VIP content settings unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveMutationUserId(request);
    if (!identity.ok) return NextResponse.json({ ok: false, reason: identity.reason }, { status: 401 });

    const client = createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, reason: "Supabase is required for VIP content subscriptions." }, { status: 503 });

    const enabled = Boolean(body.enabled);
    const monthlyPrice = Number(body.monthlyPrice ?? 0);
    const currency = String(body.currency ?? "UGX").trim().toUpperCase();
    const title = String(body.title ?? "VIP Content").trim().slice(0, 120) || "VIP Content";
    const description = String(body.description ?? "").trim().slice(0, 500) || null;

    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return NextResponse.json({ ok: false, reason: "A monthly content subscription price greater than zero is required." }, { status: 400 });
    if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ ok: false, reason: "A valid currency is required." }, { status: 400 });

    const { data: profile } = await client.from("profiles").select("tier").eq("user_id", identity.userId).maybeSingle();
    if (profile?.tier !== "vip") return NextResponse.json({ ok: false, reason: "Only VIP members can sell subscriber-only content." }, { status: 403 });

    const { data, error } = await client
      .from("vip_content_settings")
      .upsert({ vip_user_id: identity.userId, enabled, monthly_price: monthlyPrice, currency, title, description, updated_at: new Date().toISOString() }, { onConflict: "vip_user_id" })
      .select("vip_user_id,enabled,monthly_price,currency,title,description")
      .single();

    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "VIP content settings could not be saved." }, { status: 400 });
  }
}
